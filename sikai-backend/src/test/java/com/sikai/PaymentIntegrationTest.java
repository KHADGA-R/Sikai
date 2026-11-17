package com.sikai;

import com.fasterxml.jackson.databind.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

/** Exercise actual HTTP provider adapters against a local fake provider, with real SQL and auth. */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:sikai-payments;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sikai.payments.usd-npr-rate=100","sikai.payments.esewa.product-code=TEST","sikai.payments.esewa.secret-key=test-secret","sikai.payments.khalti.secret-key=test-key","sikai.admin-email=","sikai.admin-password=","logging.level.root=WARN","debug=false"})
@AutoConfigureMockMvc
class PaymentIntegrationTest {
    static final ObjectMapper JSON=new ObjectMapper();
    static final AtomicReference<String> state=new AtomicReference<>("Completed");
    static final AtomicReference<BigDecimal> paid=new AtomicReference<>(new BigDecimal("100000"));
    static final AtomicInteger starts=new AtomicInteger();
    static final AtomicReference<JsonNode> initiate=new AtomicReference<>();
    static final AtomicBoolean rejectStart=new AtomicBoolean(false);
    static final AtomicReference<String> paypalState=new AtomicReference<>("CREATED");
    static final AtomicReference<String> paypalCurrency=new AtomicReference<>("USD");
    static final AtomicReference<String> paypalAmount=new AtomicReference<>("10.00");
    static final AtomicReference<String> captureState=new AtomicReference<>("COMPLETED");
    static final AtomicReference<JsonNode> paypalCreate=new AtomicReference<>();
    static final AtomicInteger captures=new AtomicInteger();
    static final Map<String,JsonNode> paypalOrders=new java.util.concurrent.ConcurrentHashMap<>();
    static HttpServer server;
    static {
        try {
            server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/",exchange->{
                Object response;
                String path=exchange.getRequestURI().getPath();
                if(path.equals("/v1/oauth2/token")) {
                    response=Map.of("access_token","paypal-test-access","expires_in",3600);
                } else if(path.startsWith("/v2/checkout/orders")) {
                    String reference;
                    if(path.equals("/v2/checkout/orders")) {
                        var input=JSON.readTree(exchange.getRequestBody()); paypalCreate.set(input);
                        reference="PP-"+input.get("purchase_units").get(0).get("custom_id").asText();
                        paypalOrders.putIfAbsent(reference,input);
                        response=Map.of("id",reference,"links",List.of(Map.of("rel","payer-action","href","https://www.sandbox.paypal.com/checkoutnow?token="+reference)));
                    } else {
                        reference=path.split("/")[4];
                        if(path.endsWith("/capture")) {
                            captures.incrementAndGet(); paypalState.set("COMPLETED");
                            assertThat(exchange.getRequestHeaders().getFirst("PayPal-Request-Id")).endsWith("-capture");
                            response=Map.of("id",reference,"status","COMPLETED");
                        } else {
                            var unit=paypalOrders.get(reference).get("purchase_units").get(0);
                            var amount=Map.of("currency_code",paypalCurrency.get(),"value",paypalAmount.get());
                            response=Map.of("id",reference,"intent","CAPTURE","status",paypalState.get(),"purchase_units",List.of(Map.of("custom_id",unit.get("custom_id").asText(),"amount",amount,
                                "payments",Map.of("captures",List.of(Map.of("id","CAP-"+reference,"status",captureState.get(),"amount",amount))))));
                        }
                    }
                } else if(path.endsWith("initiate/")) {
                    starts.incrementAndGet();
                    if(rejectStart.get()) { exchange.sendResponseHeaders(503,-1); exchange.close(); return; }
                    initiate.set(JSON.readTree(exchange.getRequestBody()));
                    response=Map.of("pidx","pidx-"+initiate.get().get("purchase_order_id").asText(),"payment_url","https://test-pay.khalti.com/?pidx=test");
                } else if(path.endsWith("lookup/")) {
                    var input=JSON.readTree(exchange.getRequestBody());
                    response=Map.of("pidx",input.get("pidx").asText(),"status",state.get(),"total_amount",paid.get(),"transaction_id","txn-"+input.get("pidx").asText(),"refunded",false);
                } else {
                    var query=new HashMap<String,String>();
                    for(String entry:exchange.getRequestURI().getQuery().split("&")) { var parts=entry.split("=",2); query.put(parts[0],parts[1]); }
                    response=Map.of("product_code","TEST","transaction_uuid",query.get("transaction_uuid"),"total_amount",paid.get(),"status",state.get(),"ref_id","ref-"+query.get("transaction_uuid"));
                }
                byte[] bytes=JSON.writeValueAsBytes(response);
                exchange.getResponseHeaders().add("Content-Type","application/json");
                exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
            });
            server.start();
        } catch(Exception e) { throw new ExceptionInInitializerError(e); }
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        String base="http://127.0.0.1:"+server.getAddress().getPort()+"/";
        registry.add("sikai.payments.khalti.api-url",()->base);
        registry.add("sikai.payments.esewa.status-url",()->base+"status/");
        registry.add("sikai.payments.paypal.api-url",()->base);
        registry.add("sikai.payments.paypal.client-id",()->"paypal-test-client");
        registry.add("sikai.payments.paypal.enabled",()->"true");
        registry.add("sikai.payments.paypal.client-secret",()->"paypal-test-secret");
    }
    @AfterAll static void stop() { server.stop(0); }
    @BeforeEach void reset() { state.set("Completed"); paid.set(new BigDecimal("100000")); starts.set(0); rejectStart.set(false); paypalState.set("CREATED"); paypalCurrency.set("USD"); paypalAmount.set("10.00"); captureState.set("COMPLETED"); captures.set(0); }
    @Autowired MockMvc mvc;
    @Autowired PaymentGateway gateway;
    @Autowired Db db;

    JsonNode call(String method,String path,String token,Object body,int status) throws Exception {
        var request=method.equals("POST")?post(path):get(path);
        if(token!=null) request.header("Authorization","Bearer "+token);
        if(body!=null) request.contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsBytes(body));
        return JSON.readTree(mvc.perform(request).andExpect(status().is(status)).andReturn().getResponse().getContentAsString());
    }
    String register(String role) throws Exception { return call("POST","/api/auth/register",null,Map.of("name","Payment tester","email",UUID.randomUUID()+"@test.example","password","Pass12345!","role",role),201).get("token").asText(); }
    long course() throws Exception {
        String teacher=register("instructor");
        var data=new HashMap<String,Object>();
        data.put("title","Paid Nepali course"); data.put("description","Learn Nepali"); data.put("category","Languages"); data.put("subcategory","Nepali");
        data.put("price",10); data.put("level","BEGINNER"); data.put("durationHours",2); data.put("emoji","N"); data.put("accent","teal"); data.put("published",true);
        return call("POST","/api/instructor/courses",teacher,data,201).get("id").asLong();
    }
    String order(String buyer,long course) throws Exception { return call("POST","/api/checkout/orders",buyer,Map.of("courseId",course),200).get("id").asText(); }
    JsonNode start(String buyer,String order,String provider,int status) throws Exception { return call("POST","/api/checkout/orders/"+order+"/payments",buyer,Map.of("provider",provider,"expectedAmount",1000,"expectedCurrency","NPR"),status); }
    JsonNode verify(String buyer,String id,Object body,int status) throws Exception { return call("POST","/api/checkout/payments/"+id+"/verify",buyer,body,status); }

    @Test void khaltiUsesPaisaAndVerifiesBeforeIdempotentEnrollment() throws Exception {
        String buyer=register("student"),other=register("student"); long course=course(); String order=order(buyer,course);
        var quote=call("GET","/api/checkout/courses/"+course,buyer,null,200);
        assertThat(quote.get("currency").asText()).isEqualTo("NPR");
        assertThat(quote.get("amount").decimalValue()).isEqualByComparingTo("1000");
        var payment=start(buyer,order,"khalti",200); String id=payment.get("id").asText();
        assertThat(initiate.get().get("amount").asLong()).isEqualTo(100000);
        assertThat(initiate.get().get("return_url").asText()).endsWith("/checkout/"+course+"/payment/"+id);
        assertThat(start(buyer,order,"khalti",200).get("id").asText()).isEqualTo(id);
        assertThat(starts.get()).isEqualTo(1);
        start(buyer,order,"esewa",409);
        verify(other,id,Map.of(),404);
        state.set("Pending");
        assertThat(verify(buyer,id,Map.of("status","Completed"),200).get("status").asText()).isEqualTo("pending");
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).isEmpty();
        state.set("Completed"); paid.set(new BigDecimal("1")); verify(buyer,id,Map.of(),502);
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).isEmpty();
        paid.set(new BigDecimal("100000"));
        assertThat(verify(buyer,id,Map.of(),200).get("status").asText()).isEqualTo("completed");
        verify(buyer,id,Map.of(),200);
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).hasSize(1);
    }

    @Test void esewaSignsFormRejectsTamperedCallbackAndChecksStatus() throws Exception {
        String buyer=register("student"); long course=course(); String order=order(buyer,course);
        var payment=start(buyer,order,"esewa",200); String id=payment.get("id").asText();
        assertThat(payment.get("redirect").get("url").asText()).isEqualTo("https://rc.esewa.com.np/api/epay/main/v2/form");
        var oldRedirect=JSON.convertValue(payment.get("redirect"),new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
        oldRedirect.put("url","https://rc-epay.esewa.com.np/api/epay/main/v2/form");
        db.update("UPDATE checkout_payment SET redirect_json=? WHERE id=?",JSON.writeValueAsString(oldRedirect),id);
        assertThat(call("GET","/api/checkout/payments/"+id,buyer,null,200).get("redirect").get("url").asText()).isEqualTo("https://rc.esewa.com.np/api/epay/main/v2/form");
        var fields=payment.get("redirect").get("fields");
        assertThat(fields.get("signature").asText()).isEqualTo(gateway.signature("total_amount=1000.00,transaction_uuid="+id+",product_code=TEST"));
        assertThat(payment.toString()).doesNotContain("test-secret");
        verify(buyer,id,Map.of("data",Base64.getEncoder().encodeToString("{}".getBytes(StandardCharsets.UTF_8))),400);
        state.set("PENDING"); paid.set(new BigDecimal("1000"));
        assertThat(verify(buyer,id,Map.of(),200).get("status").asText()).isEqualTo("pending");
        state.set("COMPLETE"); paid.set(new BigDecimal("1")); verify(buyer,id,Map.of(),502);
        var callback=new LinkedHashMap<String,String>();
        callback.put("transaction_code","code"); callback.put("status","COMPLETE"); callback.put("total_amount","1,000.00"); callback.put("transaction_uuid",id); callback.put("product_code","TEST");
        callback.put("signed_field_names","transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names");
        var parts=new ArrayList<String>(); for(String name:callback.get("signed_field_names").split(",")) parts.add(name+"="+callback.get(name));
        callback.put("signature",gateway.signature(String.join(",",parts)));
        paid.set(new BigDecimal("1000"));
        var valid=new HashMap<>(callback); callback.put("total_amount","2,000.00");
        verify(buyer,id,Map.of("data",Base64.getEncoder().encodeToString(JSON.writeValueAsBytes(callback))),400);
        assertThat(verify(buyer,id,Map.of("data",Base64.getEncoder().encodeToString(JSON.writeValueAsBytes(valid))),200).get("status").asText()).isEqualTo("completed");
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).hasSize(1);
    }

    @Test void cancelledKhaltiAttemptAllowsFreshProviderAndRejectsChangedTotal() throws Exception {
        String buyer=register("student"); String order=order(buyer,course());
        call("POST","/api/checkout/orders/"+order+"/payments",buyer,Map.of("provider","khalti","expectedAmount",1,"expectedCurrency","NPR"),409);
        String id=start(buyer,order,"khalti",200).get("id").asText();
        state.set("User canceled"); assertThat(verify(buyer,id,Map.of(),200).get("status").asText()).isEqualTo("failed");
        assertThat(start(buyer,order,"esewa",200).get("id").asText()).isNotEqualTo(id);
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).isEmpty();
    }

    @Test void uncertainInitiationCannotStartAnotherCharge() throws Exception {
        String buyer=register("student"); long course=course(); String order=order(buyer,course);
        rejectStart.set(true); start(buyer,order,"khalti",502);
        rejectStart.set(false); start(buyer,order,"khalti",409); start(buyer,order,"esewa",409);
        assertThat(starts.get()).isEqualTo(1);
        String attempt=call("GET","/api/checkout/courses/"+course,buyer,null,200).get("activeAttempt").asText();
        verify(buyer,attempt,Map.of(),409);
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).isEmpty();
    }

    @Test void paypalChargesUsdCapturesOnlyApprovedOrdersAndRejectsUnsettledCaptures() throws Exception {
        String buyer=register("student"),other=register("student"); long course=course(); String order=order(buyer,course);
        call("POST","/api/checkout/orders/"+order+"/payments",buyer,Map.of("provider","paypal","expectedAmount",10,"expectedCurrency","NPR"),409);
        var payment=call("POST","/api/checkout/orders/"+order+"/payments",buyer,Map.of("provider","paypal","expectedAmount",10,"expectedCurrency","USD"),200);
        String id=payment.get("id").asText();
        assertThat(payment.get("currency").asText()).isEqualTo("USD");
        assertThat(payment.get("amount").decimalValue()).isEqualByComparingTo("10");
        assertThat(paypalCreate.get().get("purchase_units").get(0).get("amount").get("currency_code").asText()).isEqualTo("USD");
        assertThat(payment.toString()).doesNotContain("paypal-test-secret","paypal-test-access");
        verify(other,id,Map.of(),404);
        verify(buyer,id,Map.of("token","OTHER-ORDER","status","COMPLETED"),200);
        assertThat(captures.get()).isZero();
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).isEmpty();
        paypalState.set("APPROVED"); paypalAmount.set("1.00"); verify(buyer,id,Map.of(),502);
        paypalAmount.set("10.00"); paypalCurrency.set("NPR"); verify(buyer,id,Map.of(),502);
        assertThat(captures.get()).isZero();
        paypalCurrency.set("USD"); captureState.set("PENDING");
        assertThat(verify(buyer,id,Map.of(),200).get("status").asText()).isEqualTo("pending");
        assertThat(captures.get()).isEqualTo(1);
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).isEmpty();
        captureState.set("COMPLETED");
        assertThat(verify(buyer,id,Map.of(),200).get("status").asText()).isEqualTo("completed");
        verify(buyer,id,Map.of(),200);
        assertThat(captures.get()).isEqualTo(1);
        assertThat(call("GET","/api/me/enrollments",buyer,null,200)).hasSize(1);
        var user=call("GET","/api/auth/me",other,null,200);
        var noRate=new PaymentService(db,gateway,JSON,BigDecimal.ZERO);
        var quote=noRate.quote(course,new AuthService.User(user.get("id").asText(),"Other","other@test.example","student"),new BigDecimal("10"));
        assertThat(quote.get("paymentAvailable")).isEqualTo(true);
    }
}
