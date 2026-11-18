package com.sikai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

/** Persist immutable provider-currency attempts and serialize settlement by buyer. */
@Service
public class PaymentService {
    public record Reservation(Map<String,Object> payment, boolean fresh) {}
    private final Db db;
    private final PaymentGateway gateway;
    private final ObjectMapper mapper;
    private final BigDecimal rate;
    private final CheckoutOrders orders;

    public PaymentService(Db db,PaymentGateway gateway,ObjectMapper mapper,CheckoutOrders orders,@Value("${sikai.payments.usd-npr-rate:0}") BigDecimal rate) {
        this.db=db; this.gateway=gateway; this.mapper=mapper; this.orders=orders; this.rate=rate;
        if(rate.signum()<0) throw new IllegalArgumentException("USD_NPR_RATE must be positive or zero to disable paid checkout");
    }

    public Map<String,Object> quote(long courseId,AuthService.User user,BigDecimal usd) {
        var active=db.list("SELECT p.*,o.amount AS original_amount FROM checkout_payment p JOIN checkout_order o ON o.id=p.order_id WHERE o.user_id=? AND o.basket_key=? AND p.status IN ('creating','pending') ORDER BY p.created_at DESC",user.id(),"courses:"+courseId);
        return quoteData(courseId,user,usd,active);
    }
    public Map<String,Object> quoteOrder(String orderId,AuthService.User user) {
        var order=orders.owned(orderId,user);
        var active=db.list("SELECT p.*,o.amount AS original_amount FROM checkout_payment p JOIN checkout_order o ON o.id=p.order_id WHERE o.user_id=? AND o.id=? AND p.status IN ('creating','pending') ORDER BY p.created_at DESC",user.id(),orderId);
        var result=quoteData(((Number)order.get("courseId")).longValue(),user,(BigDecimal)order.get("amount"),active);
        result.put("orderId",orderId); result.put("items",order.get("items")); result.put("status",order.get("status"));
        result.put("subtotal",order.get("subtotal")); result.put("discountAmount",order.get("discountAmount")); result.put("couponCode",order.get("couponCode"));
        return result;
    }
    private Map<String,Object> quoteData(long courseId,AuthService.User user,BigDecimal usd,List<Map<String,Object>> active) {
        BigDecimal amount=usd.signum()==0?BigDecimal.ZERO:rate.signum()>0?convert(usd):usd;
        var result=new LinkedHashMap<String,Object>();
        result.put("courseId",courseId); result.put("amount",active.isEmpty()?amount:active.get(0).get("amount"));
        result.put("currency",active.isEmpty()?(rate.signum()>0?"NPR":"USD"):active.get(0).get("currency")); result.put("originalAmount",active.isEmpty()?usd:active.get(0).get("original_amount")); result.put("originalCurrency","USD");
        result.put("exchangeRate",rate); result.put("enrolled",db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),courseId));
        var providers=List.of(option("esewa","eSewa",usd,active),option("khalti","Khalti",usd,active),option("paypal","PayPal",usd,active));
        result.put("providers",providers);
        result.put("paymentAvailable",providers.stream().anyMatch(p->Boolean.TRUE.equals(p.get("available"))));
        result.put("activeAttempt",active.isEmpty()?null:active.get(0).get("id"));
        result.put("activeProvider",active.isEmpty()?null:active.get(0).get("provider"));
        result.put("configurationMessage","Online payments are unavailable until the store configures a payment provider.");
        return result;
    }
    private Map<String,Object> option(String key,String label,BigDecimal usd,List<Map<String,Object>> active) {
        BigDecimal amount=key.equals("paypal")?usd:convert(usd);
        String currency=key.equals("paypal")?"USD":"NPR";
        if(!active.isEmpty() && key.equals(active.get(0).get("provider"))) amount=(BigDecimal)active.get(0).get("amount");
        boolean available=gateway.available(key) && (key.equals("paypal") || rate.signum()>0) && (!key.equals("khalti") || amount.compareTo(new BigDecimal("10"))>=0);
        return Map.of("id",key,"label",label,"amount",amount,"currency",currency,"available",available);
    }
    private BigDecimal convert(BigDecimal usd) { return usd.multiply(rate).setScale(2,RoundingMode.HALF_UP); }

    /** Commit the reservation before calling a provider, preventing duplicate starts after timeouts. */
    @Transactional
    public Reservation reserve(String orderId,String provider,BigDecimal expectedAmount,String expectedCurrency,AuthService.User user) {
        lock(user);
        var order=db.one("SELECT * FROM checkout_order WHERE id=? AND user_id=?",orderId,user.id());
        Db.require("pending".equals(order.get("status")),CONFLICT,"This order is already completed");
        var existing=db.list("SELECT * FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending','completed') ORDER BY created_at DESC",orderId);
        if(!existing.isEmpty()) {
            var payment=existing.get(0);
            Db.require(expectedCurrency.equals(payment.get("currency")),CONFLICT,"Payment currency changed. Refresh checkout to review the total");
            Db.require(((BigDecimal)payment.get("amount")).compareTo(expectedAmount)==0,CONFLICT,"A payment with a different total is already in progress. Refresh checkout to review it");
            Db.require(provider.equals(payment.get("provider")),CONFLICT,"A payment is already in progress with "+payment.get("provider")+". Check its status before changing provider");
            if("paypal".equals(provider) && "creating".equals(payment.get("status"))) return new Reservation(payment,true);
            Db.require(!"creating".equals(payment.get("status")),CONFLICT,"Payment initiation is unresolved. Check payment status or contact support before trying another payment");
            return new Reservation(payment,false);
        }
        Db.require((provider.equals("paypal") || rate.signum()>0) && gateway.available(provider),SERVICE_UNAVAILABLE,"This payment provider or its currency pricing is not configured");
        orders.validate(orderId,user);
        String currency=provider.equals("paypal")?"USD":"NPR";
        Db.require(currency.equals(expectedCurrency),CONFLICT,"Incorrect payment currency. Refresh checkout to review the total");
        BigDecimal amount=provider.equals("paypal")?(BigDecimal)order.get("amount"):convert((BigDecimal)order.get("amount"));
        Db.require(amount.signum()>0,BAD_REQUEST,"Use free checkout for this course");
        Db.require(amount.compareTo(expectedAmount)==0,CONFLICT,"Checkout total changed. Refresh and review the new total");
        Db.require(!provider.equals("khalti") || amount.compareTo(new BigDecimal("10"))>=0,BAD_REQUEST,"Khalti requires at least NPR 10");
        orders.reserveDiscount(orderId,user);
        String id=Db.id();
        db.update("INSERT INTO checkout_payment(id,order_id,course_id,provider,amount,currency,status,created_at) VALUES (?,?,?,?,?,?,'creating',?)",id,orderId,order.get("course_id"),provider,amount,currency,System.currentTimeMillis());
        return new Reservation(db.one("SELECT * FROM checkout_payment WHERE id=?",id),true);
    }

    public Map<String,Object> owned(String id,AuthService.User user) {
        return db.one("SELECT p.*,o.user_id,o.course_id,o.course_title FROM checkout_payment p JOIN checkout_order o ON o.id=p.order_id WHERE p.id=? AND o.user_id=?",id,user.id());
    }

    @Transactional
    public void initialized(String id,PaymentGateway.Start start,AuthService.User user) {
        lock(user); owned(id,user);
        try { db.update("UPDATE checkout_payment SET reference=?,redirect_json=?,status='pending' WHERE id=? AND status='creating'",start.reference(),mapper.writeValueAsString(start.redirect()),id); }
        catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    public Map<String,Object> response(Map<String,Object> payment) {
        var result=new LinkedHashMap<String,Object>();
        for(String key:List.of("id","provider","amount","currency","status")) result.put(key,payment.get(key));
        result.put("courseId",payment.get("course_id"));
        result.put("orderId",payment.get("order_id"));
        result.put("courseIds",orders.items(payment.get("order_id").toString()).stream().map(i->i.get("courseId")).toList());
        if(payment.get("redirect_json")!=null) {
            try {
                var redirect=mapper.readValue(payment.get("redirect_json").toString(),new TypeReference<Map<String,Object>>(){});
                // Legacy forms have already consumed their UUID. Never send them for resubmission.
                if("esewa".equals(payment.get("provider")) && "POST".equals(redirect.get("method"))) result.put("legacySession",true);
                else result.put("redirect",redirect);
            }
            catch(Exception e) { throw new IllegalStateException("Invalid persisted payment redirect",e); }
        }
        return result;
    }

    /** Verify outside transactions; the final commit rechecks ownership/state under the same user lock. */
    public PaymentGateway.Verification verify(Map<String,Object> payment,String data) {
        if("completed".equals(payment.get("status"))) return new PaymentGateway.Verification("completed",payment.get("transaction_id").toString());
        Db.require(!"creating".equals(payment.get("status")) || "esewa".equals(payment.get("provider")),CONFLICT,"Payment initiation is unresolved. Contact support to reconcile this attempt");
        return gateway.verify(payment.get("provider").toString(),payment.get("id").toString(),Objects.toString(payment.get("reference"),""),(BigDecimal)payment.get("amount"),data);
    }

    @Transactional
    public Map<String,Object> settle(String id,PaymentGateway.Verification verified,AuthService.User user) {
        lock(user); var payment=owned(id,user);
        if("completed".equals(payment.get("status"))) return response(payment);
        if("failed".equals(payment.get("status")) && !"completed".equals(verified.status())) return response(payment);
        if("completed".equals(verified.status())) {
            orders.fulfill(payment.get("order_id").toString(),user);
            db.update("UPDATE checkout_payment SET status='completed',transaction_id=? WHERE id=?",verified.transactionId(),id);
        } else {
            db.update("UPDATE checkout_payment SET status=? WHERE id=?",verified.status(),id);
            if("failed".equals(verified.status())) orders.releaseDiscount(payment.get("order_id").toString());
        }
        return response(owned(id,user));
    }
    private void lock(AuthService.User user) { db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id()); }
}
