package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/checkout")
public class PaymentController {
    public record StartInput(@NotNull @Pattern(regexp="esewa|khalti|paypal") String provider,@NotNull @DecimalMin("0.01") BigDecimal expectedAmount,@NotNull @Pattern(regexp="NPR|USD") String expectedCurrency) {}
    public record VerifyInput(@Size(max=16000) String data) {}
    private final PaymentService payments;
    private final PaymentGateway gateway;
    public PaymentController(PaymentService payments,PaymentGateway gateway) { this.payments=payments; this.gateway=gateway; }

    @PostMapping("/orders/{orderId}/payments")
    public Object start(@PathVariable String orderId,@Valid @RequestBody StartInput input,@AuthenticationPrincipal AuthService.User user) {
        var reserved=payments.reserve(orderId,input.provider(),input.expectedAmount(),input.expectedCurrency(),user);
        String id=reserved.payment().get("id").toString();
        if(reserved.fresh()) initialize(id,user);
        return payments.response(payments.owned(id,user));
    }

    @PostMapping("/payments/{id}/verify")
    public Object verify(@PathVariable String id,@Valid @RequestBody(required=false) VerifyInput input,@AuthenticationPrincipal AuthService.User user) {
        var payment=payments.owned(id,user);
        if("paypal".equals(payment.get("provider")) && "creating".equals(payment.get("status"))) {
            initialize(id,user); payment=payments.owned(id,user);
        }
        return payments.settle(id,payments.verify(payment,input==null?null:input.data()),user);
    }

    @GetMapping("/payments/{id}")
    public Map<String,Object> payment(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { return payments.response(payments.owned(id,user)); }

    private void initialize(String id,AuthService.User user) {
        var payment=payments.owned(id,user);
        var redirect=gateway.start(payment.get("provider").toString(),id,((Number)payment.get("course_id")).longValue(),payment.get("course_title").toString(),(BigDecimal)payment.get("amount"));
        payments.initialized(id,redirect,user);
    }
}
