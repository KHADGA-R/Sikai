package com.sikai;

import jakarta.validation.constraints.*;
import java.math.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

/** Coupons are priced in catalog USD. Reservations serialize usage limits across pending payments. */
@Service
public class CouponService {
    public record Input(@NotBlank @Size(max=32) String code,@NotNull @Pattern(regexp="percent|fixed") String discountType,
        @NotNull @DecimalMin("0.01") @DecimalMax("9999999999.99") @Digits(integer=10,fraction=2) BigDecimal discountValue,
        @NotNull @DecimalMin("0") @DecimalMax("9999999999.99") @Digits(integer=10,fraction=2) BigDecimal minimumSubtotal,
        @Positive Long startsAt,@Positive Long expiresAt,boolean active,@Min(1) @Max(1000000) Integer maxRedemptions,@Min(1) @Max(1000) int perUserLimit) {}
    private final Db db;
    public CouponService(Db db) { this.db=db; }
    public Object list() {
        return db.list("SELECT c.id,c.code,c.discount_type AS \"discountType\",c.discount_value AS \"discountValue\",c.minimum_subtotal AS \"minimumSubtotal\",c.starts_at AS \"startsAt\",c.expires_at AS \"expiresAt\",c.active,c.max_redemptions AS \"maxRedemptions\",c.per_user_limit AS \"perUserLimit\",(SELECT COUNT(*) FROM coupon_redemption r WHERE r.coupon_id=c.id AND r.status='completed') AS redeemed,(SELECT COUNT(*) FROM coupon_redemption r WHERE r.coupon_id=c.id AND r.status='reserved') AS reserved FROM discount_coupon c ORDER BY c.created_at DESC,c.id");
    }
    @Transactional public Object create(Input input) {
        String code=normalize(input.code());
        Db.require(code.matches("[A-Z0-9][A-Z0-9_-]{2,31}"),BAD_REQUEST,"Use 3–32 letters, numbers, hyphens or underscores for the code");
        Db.require(!input.discountType().equals("percent") || input.discountValue().compareTo(new BigDecimal("100"))<=0,BAD_REQUEST,"Percentage discount cannot exceed 100");
        Db.require(input.startsAt()==null || input.expiresAt()==null || input.startsAt()<input.expiresAt(),BAD_REQUEST,"Expiry must be after the start date");
        String id=Db.id(); db.update("INSERT INTO discount_coupon(id,code,discount_type,discount_value,minimum_subtotal,starts_at,expires_at,active,max_redemptions,per_user_limit,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",id,code,input.discountType(),input.discountValue(),input.minimumSubtotal(),input.startsAt(),input.expiresAt(),input.active(),input.maxRedemptions(),input.perUserLimit(),System.currentTimeMillis());
        return Map.of("id",id,"code",code);
    }
    @Transactional public void active(String id,boolean active) {
        db.one("SELECT id FROM discount_coupon WHERE id=? FOR UPDATE",id);
        db.update("UPDATE discount_coupon SET active=? WHERE id=?",active,id);
    }
    @Transactional public void apply(String orderId,String rawCode,AuthService.User user) {
        var order=editable(orderId,user);
        var matches=db.list("SELECT id FROM discount_coupon WHERE code=?",normalize(rawCode));
        Db.require(!matches.isEmpty(),BAD_REQUEST,"Promo code is invalid or unavailable");
        var coupon=lock(matches.get(0).get("id").toString());
        BigDecimal subtotal=(BigDecimal)order.get("subtotal");
        BigDecimal discount=eligible(coupon,subtotal,user.id(),orderId);
        db.update("UPDATE checkout_order SET amount=?,discount_amount=?,coupon_id=?,coupon_code=? WHERE id=?",subtotal.subtract(discount),discount,coupon.get("id"),coupon.get("code"),orderId);
    }
    @Transactional public void remove(String orderId,AuthService.User user) {
        editable(orderId,user);
        release(orderId);
        db.update("UPDATE checkout_order SET amount=subtotal,discount_amount=0,coupon_id=NULL,coupon_code=NULL WHERE id=?",orderId);
    }
    private Map<String,Object> editable(String orderId,AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        var order=db.one("SELECT * FROM checkout_order WHERE id=? AND user_id=?",orderId,user.id());
        Db.require("pending".equals(order.get("status")),CONFLICT,"This order is already complete");
        Db.require(!db.exists("SELECT id FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending','completed')",orderId),CONFLICT,"A payment is in progress. The promo code and total cannot be changed");
        return order;
    }
    /** Validate again immediately before reserving a discount; applied quotes alone consume no uses. */
    public void validate(String orderId,AuthService.User user) {
        var order=db.one("SELECT * FROM checkout_order WHERE id=? AND user_id=?",orderId,user.id());
        if(order.get("coupon_id")==null) return;
        var coupon=lock(order.get("coupon_id").toString());
        BigDecimal discount=eligible(coupon,(BigDecimal)order.get("subtotal"),user.id(),orderId);
        Db.require(discount.compareTo((BigDecimal)order.get("discount_amount"))==0,CONFLICT,"Promo discount changed. Remove and reapply the code to review your total");
    }
    public void reserve(String orderId,AuthService.User user) {
        var order=db.one("SELECT * FROM checkout_order WHERE id=? AND user_id=?",orderId,user.id());
        if(order.get("coupon_id")==null) return;
        validate(orderId,user);
        if(!db.exists("SELECT order_id FROM coupon_redemption WHERE order_id=?",orderId))
            db.update("INSERT INTO coupon_redemption(order_id,coupon_id,user_id,status,created_at) VALUES (?,?,?,'reserved',?)",orderId,order.get("coupon_id"),user.id(),System.currentTimeMillis());
    }
    /** Settlement honors a reserved discount even if the coupon expires or is disabled after initiation. */
    public void complete(String orderId,AuthService.User user) {
        var order=db.one("SELECT coupon_id FROM checkout_order WHERE id=? AND user_id=?",orderId,user.id());
        if(order.get("coupon_id")==null) return;
        lock(order.get("coupon_id").toString());
        Db.require(db.exists("SELECT order_id FROM coupon_redemption WHERE order_id=? AND coupon_id=? AND user_id=?",orderId,order.get("coupon_id"),user.id()),CONFLICT,"The coupon reservation could not be verified");
        db.update("UPDATE coupon_redemption SET status='completed' WHERE order_id=?",orderId);
    }
    public void release(String orderId) {
        if(db.exists("SELECT id FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending','completed')",orderId)) return;
        var rows=db.list("SELECT coupon_id FROM coupon_redemption WHERE order_id=? AND status='reserved'",orderId);
        if(rows.isEmpty()) return;
        lock(rows.get(0).get("coupon_id").toString());
        db.update("DELETE FROM coupon_redemption WHERE order_id=? AND status='reserved'",orderId);
    }
    private Map<String,Object> lock(String id) { return db.one("SELECT * FROM discount_coupon WHERE id=? FOR UPDATE",id); }
    private BigDecimal eligible(Map<String,Object> coupon,BigDecimal subtotal,String userId,String orderId) {
        long now=System.currentTimeMillis();
        Db.require(Boolean.TRUE.equals(coupon.get("active")),BAD_REQUEST,"This promo code is inactive");
        Db.require(coupon.get("starts_at")==null || ((Number)coupon.get("starts_at")).longValue()<=now,BAD_REQUEST,"This promo code is not active yet");
        Db.require(coupon.get("expires_at")==null || ((Number)coupon.get("expires_at")).longValue()>now,BAD_REQUEST,"This promo code has expired");
        Db.require(subtotal.signum()>0,BAD_REQUEST,"Promo codes apply to paid courses only");
        Db.require(subtotal.compareTo((BigDecimal)coupon.get("minimum_subtotal"))>=0,BAD_REQUEST,"This code requires a minimum course subtotal of USD "+coupon.get("minimum_subtotal"));
        long total=((Number)db.one("SELECT COUNT(*) AS total FROM coupon_redemption WHERE coupon_id=? AND order_id<>?",coupon.get("id"),orderId).get("total")).longValue();
        long personal=((Number)db.one("SELECT COUNT(*) AS total FROM coupon_redemption WHERE coupon_id=? AND user_id=? AND order_id<>?",coupon.get("id"),userId,orderId).get("total")).longValue();
        Db.require(coupon.get("max_redemptions")==null || total<((Number)coupon.get("max_redemptions")).longValue(),BAD_REQUEST,"This promo code has reached its usage limit");
        Db.require(personal<((Number)coupon.get("per_user_limit")).longValue(),BAD_REQUEST,"You have already used this promo code");
        BigDecimal value=(BigDecimal)coupon.get("discount_value");
        BigDecimal discount="percent".equals(coupon.get("discount_type"))?subtotal.multiply(value).divide(new BigDecimal("100"),2,RoundingMode.HALF_UP):value;
        discount=discount.min(subtotal).setScale(2,RoundingMode.HALF_UP);
        Db.require(discount.signum()>0,BAD_REQUEST,"This promo code does not reduce the order total");
        return discount;
    }
    private static String normalize(String code) { return code.trim().toUpperCase(Locale.ROOT); }
}
