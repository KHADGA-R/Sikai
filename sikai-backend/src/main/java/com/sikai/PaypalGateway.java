package com.sikai;

import com.fasterxml.jackson.databind.*;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

/** PayPal Orders v2 redirect checkout with idempotent server-side capture in USD. */
@Service
public class PaypalGateway {
    private final ObjectMapper mapper;
    private final String clientId,secret,base,frontend;
    private final boolean enabled;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private String token;
    private long tokenUntil;

    public PaypalGateway(ObjectMapper mapper,
        @Value("${sikai.payments.paypal.enabled:false}") boolean enabled,
        @Value("${sikai.payments.paypal.client-id:}") String clientId,
        @Value("${sikai.payments.paypal.client-secret:}") String secret,
        @Value("${sikai.payments.paypal.api-url:https://api-m.sandbox.paypal.com}") String base,
        @Value("${sikai.payments.frontend-url:http://localhost:4200}") String frontend) {
        this.mapper=mapper; this.enabled=enabled; this.clientId=clientId; this.secret=secret;
        this.base=base.replaceAll("/+$",""); this.frontend=frontend.replaceAll("/+$","");
    }
    public boolean available() { return enabled && !clientId.isBlank() && !secret.isBlank(); }

    public PaymentGateway.Start start(String id,long courseId,String title,BigDecimal amount) {
        String callback=frontend+"/checkout/"+courseId+"/payment/"+id;
        var payload=Map.of("intent","CAPTURE",
            "purchase_units",List.of(Map.of("reference_id",id,"custom_id",id,"description",title.substring(0,Math.min(127,title.length())),
                "amount",Map.of("currency_code","USD","value",amount.setScale(2).toPlainString()))),
            "payment_source",Map.of("paypal",Map.of("experience_context",Map.of("return_url",callback,"cancel_url",callback+"?cancelled=1","shipping_preference","NO_SHIPPING","user_action","PAY_NOW"))));
        var order=api("POST","/v2/checkout/orders",payload,id+"-create");
        String reference=required(order,"id");
        for(JsonNode link:order.path("links")) {
            if(Set.of("payer-action","approve").contains(link.path("rel").asText())) {
                String url=required(link,"href"); URI uri=URI.create(url);
                Db.require("https".equals(uri.getScheme()) && Set.of("www.sandbox.paypal.com","www.paypal.com").contains(uri.getHost()),BAD_GATEWAY,"Invalid PayPal approval destination");
                return new PaymentGateway.Start(reference,Map.of("method","GET","url",url,"fields",Map.of()));
            }
        }
        throw new ResponseStatusException(BAD_GATEWAY,"PayPal did not return an approval link. Check payment status before retrying");
    }

    public PaymentGateway.Verification verify(String id,String reference,BigDecimal amount) {
        Db.require(reference.matches("[A-Za-z0-9-]{1,160}"),BAD_GATEWAY,"Invalid stored PayPal order reference");
        String path="/v2/checkout/orders/"+reference;
        var order=api("GET",path,null,null);
        validate(order,id,reference,amount);
        if("APPROVED".equals(order.path("status").asText())) {
            api("POST",path+"/capture",Map.of(),id+"-capture");
            order=api("GET",path,null,null);
            validate(order,id,reference,amount);
        }
        String status=required(order,"status");
        if(!status.equals("COMPLETED")) return new PaymentGateway.Verification(status.equals("VOIDED")?"failed":"pending",null);
        var captures=order.path("purchase_units").get(0).path("payments").path("captures");
        Db.require(captures.isArray() && captures.size()==1,BAD_GATEWAY,"PayPal capture details did not match the order");
        var capture=captures.get(0);
        if(!"COMPLETED".equals(capture.path("status").asText())) return new PaymentGateway.Verification("pending",null);
        validateAmount(capture.path("amount"),amount);
        return new PaymentGateway.Verification("completed",required(capture,"id"));
    }

    private void validate(JsonNode order,String id,String reference,BigDecimal amount) {
        Db.require(reference.equals(order.path("id").asText()) && "CAPTURE".equals(order.path("intent").asText()),BAD_GATEWAY,"PayPal order reference did not match");
        var units=order.path("purchase_units");
        Db.require(units.isArray() && units.size()==1 && id.equals(units.get(0).path("custom_id").asText()),BAD_GATEWAY,"PayPal purchase details did not match");
        validateAmount(units.get(0).path("amount"),amount);
    }
    private void validateAmount(JsonNode node,BigDecimal expected) {
        try { Db.require("USD".equals(node.path("currency_code").asText()) && new BigDecimal(node.path("value").asText()).compareTo(expected)==0,BAD_GATEWAY,"PayPal amount or currency did not match"); }
        catch(NumberFormatException e) { throw new ResponseStatusException(BAD_GATEWAY,"Invalid PayPal amount"); }
    }

    private synchronized String accessToken() {
        Db.require(available(),SERVICE_UNAVAILABLE,"PayPal is not configured");
        if(token!=null && System.currentTimeMillis()<tokenUntil) return token;
        String credentials=Base64.getEncoder().encodeToString((clientId+":"+secret).getBytes(StandardCharsets.UTF_8));
        var response=send(HttpRequest.newBuilder(URI.create(base+"/v1/oauth2/token"))
            .header("Authorization","Basic "+credentials).header("Content-Type","application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString("grant_type=client_credentials")));
        token=required(response,"access_token");
        tokenUntil=System.currentTimeMillis()+Math.max(0,Math.min(3600,response.path("expires_in").asLong(0))-30)*1000;
        return token;
    }
    private JsonNode api(String method,String path,Object body,String requestId) {
        try {
            var builder=HttpRequest.newBuilder(URI.create(base+path)).header("Authorization","Bearer "+accessToken()).header("Content-Type","application/json");
            if(requestId!=null) builder.header("PayPal-Request-Id",requestId).header("Prefer","return=representation");
            if(method.equals("GET")) builder.GET(); else builder.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
            return send(builder);
        } catch(ResponseStatusException e) { throw e; }
        catch(Exception e) { throw new ResponseStatusException(BAD_GATEWAY,"Unable to prepare PayPal request"); }
    }
    private JsonNode send(HttpRequest.Builder builder) {
        try {
            var response=client.send(builder.timeout(Duration.ofSeconds(20)).build(),HttpResponse.BodyHandlers.ofString());
            Db.require(response.statusCode()/100==2,BAD_GATEWAY,"PayPal could not process the request. Check payment status before retrying");
            return mapper.readTree(response.body());
        } catch(ResponseStatusException e) { throw e; }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new ResponseStatusException(BAD_GATEWAY,"PayPal request interrupted. Check payment status"); }
        catch(Exception e) { throw new ResponseStatusException(BAD_GATEWAY,"Unable to reach PayPal. Check payment status before retrying"); }
    }
    private static String required(JsonNode node,String key) { String value=node.path(key).asText(""); Db.require(!value.isBlank(),BAD_GATEWAY,"Incomplete PayPal response"); return value; }
}
