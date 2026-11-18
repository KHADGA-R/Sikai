package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.CREATED;

@RestController
public class CouponController {
    public record Code(@NotBlank @Size(max=32) String code) {}
    public record Status(boolean active) {}
    private final CouponService coupons;
    private final PaymentService payments;
    public CouponController(CouponService coupons,PaymentService payments) { this.coupons=coupons; this.payments=payments; }
    @GetMapping("/api/admin/coupons") public Object list() { return coupons.list(); }
    @PostMapping("/api/admin/coupons") @ResponseStatus(CREATED) public Object create(@Valid @RequestBody CouponService.Input input) { return coupons.create(input); }
    @PutMapping("/api/admin/coupons/{id}/status") public Object status(@PathVariable String id,@RequestBody Status input) { coupons.active(id,input.active()); return Map.of("success",true); }
    @PutMapping("/api/checkout/orders/{id}/coupon") public Object apply(@PathVariable String id,@Valid @RequestBody Code code,@AuthenticationPrincipal AuthService.User user) { coupons.apply(id,code.code(),user); return payments.quoteOrder(id,user); }
    @DeleteMapping("/api/checkout/orders/{id}/coupon") public Object remove(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { coupons.remove(id,user); return payments.quoteOrder(id,user); }
}
