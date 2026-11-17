package com.sikai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

/** Provider wire protocols; secrets are used only on the server. No redirects are accepted from clients. */
@Service
public class PaymentGateway {
    public record Start(String reference, Map<String,Object> redirect) {}
    public record Verification(String status, String transactionId) {}
    private final ObjectMapper mapper;
    private final PaypalGateway paypal;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String esewaCode,esewaSecret,esewaForm,esewaStatus,khaltiKey,khaltiBase,frontend;

    public PaymentGateway(ObjectMapper mapper,PaypalGateway paypal,
        @Value("${sikai.payments.esewa.product-code:}") String esewaCode,
        @Value("${sikai.payments.esewa.secret-key:}") String esewaSecret,
        @Value("${sikai.payments.esewa.form-url:https://rc.esewa.com.np/api/epay/main/v2/form}") String esewaForm,
        @Value("${sikai.payments.esewa.status-url:https://rc.esewa.com.np/api/epay/transaction/status/}") String esewaStatus,
        @Value("${sikai.payments.khalti.secret-key:}") String khaltiKey,
        @Value("${sikai.payments.khalti.api-url:https://dev.khalti.com/api/v2/}") String khaltiBase,
        @Value("${sikai.payments.frontend-url:http://localhost:4200}") String frontend) {
        this.mapper=mapper; this.paypal=paypal; this.esewaCode=esewaCode; this.esewaSecret=esewaSecret;
        this.esewaForm=esewaForm; this.esewaStatus=esewaStatus; this.khaltiKey=khaltiKey;
        this.khaltiBase=khaltiBase.endsWith("/")?khaltiBase:khaltiBase+"/";
        this.frontend=frontend.replaceAll("/+$","");
    }

    public String formUrl() { return esewaForm; }

    public boolean available(String provider) {
        return switch(provider) { case "esewa" -> !esewaCode.isBlank() && !esewaSecret.isBlank(); case "khalti" -> !khaltiKey.isBlank(); case "paypal" -> paypal.available(); default -> false; };
    }

    public Start start(String provider,String id,long courseId,String title,BigDecimal amount) {
        Db.require(available(provider),SERVICE_UNAVAILABLE,"The selected payment provider is not configured");
        if(provider.equals("paypal")) return paypal.start(id,courseId,title,amount);
        String callback=frontend+"/checkout/"+courseId+"/payment/"+id;
        if(provider.equals("esewa")) {
            String total=amount.toPlainString();
            var fields=new LinkedHashMap<String,String>();
            fields.put("amount",total); fields.put("tax_amount","0"); fields.put("total_amount",total);
            fields.put("transaction_uuid",id); fields.put("product_code",esewaCode);
            fields.put("product_service_charge","0"); fields.put("product_delivery_charge","0");
            fields.put("success_url",callback); fields.put("failure_url",callback+"?cancelled=1");
            fields.put("signed_field_names","total_amount,transaction_uuid,product_code");
            fields.put("signature",signature("total_amount="+total+",transaction_uuid="+id+",product_code="+esewaCode));
            return new Start(id,Map.of("method","POST","url",esewaForm,"fields",fields));
        }
        Db.require(amount.compareTo(new BigDecimal("10"))>=0,BAD_REQUEST,"Khalti requires at least NPR 10. Choose eSewa for this order");
        var response=post("epayment/initiate/",Map.of("return_url",callback,"website_url",frontend,
            "amount",amount.movePointRight(2).longValueExact(),"purchase_order_id",id,"purchase_order_name",title));
        String reference=required(response,"pidx"),url=required(response,"payment_url");
        URI uri=URI.create(url);
        Db.require("https".equals(uri.getScheme()) && Set.of("pay.khalti.com","test-pay.khalti.com").contains(uri.getHost()),BAD_GATEWAY,"Invalid payment redirect from Khalti");
        return new Start(reference,Map.of("method","GET","url",url,"fields",Map.of()));
    }

    public Verification verify(String provider,String id,String reference,BigDecimal amount,String data) {
        Db.require(available(provider),SERVICE_UNAVAILABLE,"The selected payment provider is not configured");
        if(provider.equals("paypal")) return paypal.verify(id,reference,amount);
        if(provider.equals("esewa")) {
            if(data!=null && !data.isBlank()) verifyEsewaData(data,id,amount);
            String query="product_code="+encode(esewaCode)+"&total_amount="+encode(amount.toPlainString())+"&transaction_uuid="+encode(id);
            var result=send(HttpRequest.newBuilder(URI.create(esewaStatus+"?"+query)).GET().build(),false);
            String state=required(result,"status");
            if(!state.equals("COMPLETE")) return new Verification(state.equals("CANCELED")?"failed":"pending",null);
            Db.require(esewaCode.equals(result.path("product_code").asText()) && id.equals(result.path("transaction_uuid").asText()) && money(result,"total_amount").compareTo(amount)==0,BAD_GATEWAY,"eSewa payment details did not match the order");
            return new Verification("completed",required(result,"ref_id"));
        }
        var result=post("epayment/lookup/",Map.of("pidx",reference));
        Db.require(reference.equals(result.path("pidx").asText()),BAD_GATEWAY,"Khalti payment reference did not match");
        String state=required(result,"status");
        if(!state.equals("Completed")) return new Verification(Set.of("Expired","User canceled").contains(state)?"failed":"pending",null);
        Db.require(!result.path("refunded").asBoolean(false) && money(result,"total_amount").compareTo(amount.movePointRight(2))==0,BAD_GATEWAY,"Khalti payment amount did not match the order");
        return new Verification("completed",required(result,"transaction_id"));
    }

    private void verifyEsewaData(String data,String id,BigDecimal amount) {
        try {
            Db.require(data.length()<=16000,BAD_REQUEST,"Invalid eSewa response");
            var json=mapper.readTree(Base64.getDecoder().decode(data));
            String names=required(json,"signed_field_names");
            var fields=Arrays.asList(names.split(",",-1));
            Db.require(fields.containsAll(List.of("transaction_code","status","total_amount","transaction_uuid","product_code")) && new HashSet<>(fields).size()==fields.size(),BAD_REQUEST,"Invalid eSewa signed fields");
            var parts=new ArrayList<String>();
            for(String field:fields) { Db.require(field.matches("[a-z_]+"),BAD_REQUEST,"Invalid eSewa signed fields"); parts.add(field+"="+required(json,field)); }
            Db.require(MessageDigest.isEqual(Base64.getDecoder().decode(signature(String.join(",",parts))),Base64.getDecoder().decode(required(json,"signature"))),BAD_REQUEST,"Invalid eSewa payment signature");
            Db.require(id.equals(json.path("transaction_uuid").asText()) && esewaCode.equals(json.path("product_code").asText()) && money(json,"total_amount").compareTo(amount)==0,BAD_REQUEST,"eSewa response did not match the order");
        } catch(Exception e) { throw new ResponseStatusException(BAD_REQUEST,"Invalid eSewa payment response"); }
    }

    private JsonNode post(String path,Object body) {
        try {
            return send(HttpRequest.newBuilder(URI.create(khaltiBase+path)).header("Authorization","Key "+khaltiKey)
                .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(),path.contains("lookup"));
        } catch(ResponseStatusException e) { throw e; }
        catch(Exception e) { throw new ResponseStatusException(BAD_GATEWAY,"Unable to contact Khalti. Please check payment status before retrying"); }
    }

    private JsonNode send(HttpRequest request,boolean allowLookup400) {
        try {
            // Rebuild with a bounded request timeout; HttpClient never follows redirects by default.
            var builder=HttpRequest.newBuilder(request.uri()).timeout(Duration.ofSeconds(20));
            request.headers().map().forEach((k,v)->v.forEach(value->builder.header(k,value)));
            builder.method(request.method(),request.bodyPublisher().orElse(HttpRequest.BodyPublishers.noBody()));
            var response=client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
            Db.require(response.statusCode()/100==2 || allowLookup400 && response.statusCode()==400,BAD_GATEWAY,"Payment provider could not process the request. Check payment status before retrying");
            return mapper.readTree(response.body());
        } catch(ResponseStatusException e) { throw e; }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new ResponseStatusException(BAD_GATEWAY,"Payment request interrupted. Please check payment status"); }
        catch(Exception e) { throw new ResponseStatusException(BAD_GATEWAY,"Unable to reach payment provider. Please check payment status"); }
    }

    String signature(String message) {
        try { var mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(esewaSecret.getBytes(StandardCharsets.UTF_8),"HmacSHA256")); return Base64.getEncoder().encodeToString(mac.doFinal(message.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException("Cannot sign eSewa request",e); }
    }
    private static String required(JsonNode node,String key) { String value=node.path(key).asText(""); Db.require(!value.isBlank(),BAD_GATEWAY,"Incomplete payment provider response"); return value; }
    private static BigDecimal money(JsonNode node,String key) { try { return new BigDecimal(required(node,key).replace(",","")); } catch(NumberFormatException e) { throw new ResponseStatusException(BAD_GATEWAY,"Invalid payment amount from provider"); } }
    private static String encode(String value) { return URLEncoder.encode(value,StandardCharsets.UTF_8); }
}
