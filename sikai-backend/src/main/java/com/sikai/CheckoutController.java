package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

/** Server-priced checkout with account-owned order items and one settlement per order. */
@RestController
@RequestMapping("/api/checkout")
public class CheckoutController {
    public record Input(@Positive Long courseId,@Size(min=1,max=20) List<@NotNull @Positive Long> courseIds) {}
    private final Db db;
    private final CatalogService catalog;
    private final PaymentService payments;
    private final CheckoutOrders orders;
    public CheckoutController(Db db,CatalogService catalog,PaymentService payments,CheckoutOrders orders) { this.db=db; this.catalog=catalog; this.payments=payments; this.orders=orders; }

    @GetMapping("/courses/{courseId}")
    public Object quote(@PathVariable long courseId,@AuthenticationPrincipal AuthService.User user) {
        var course=catalog.course(courseId,user);
        Db.require(Boolean.TRUE.equals(course.get("published")),CONFLICT,"Course is not published");
        return payments.quote(courseId,user,(BigDecimal)course.get("price"));
    }
    @PostMapping("/orders")
    public Object create(@Valid @RequestBody Input input,@AuthenticationPrincipal AuthService.User user) {
        Db.require((input.courseId()!=null)!=(input.courseIds()!=null),BAD_REQUEST,"Supply courseId or courseIds");
        return orders.create(input.courseId()!=null?List.of(input.courseId()):input.courseIds(),user);
    }
    @GetMapping("/orders/{id}")
    public Map<String,Object> order(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { return orders.owned(id,user); }
    @GetMapping("/orders/{id}/quote")
    public Object quoteOrder(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { return payments.quoteOrder(id,user); }
    @GetMapping("/pending")
    public Object pending(@AuthenticationPrincipal AuthService.User user) {
        return db.list("SELECT DISTINCT o.id,o.course_title AS title,o.amount,o.currency,(SELECT COUNT(*) FROM checkout_order_item i WHERE i.order_id=o.id) AS \"courseCount\" FROM checkout_order o JOIN checkout_payment p ON p.order_id=o.id WHERE o.user_id=? AND o.status='pending' AND p.status IN ('creating','pending') ORDER BY o.id",user.id());
    }
    @PostMapping("/orders/{id}/complete") @Transactional
    public Object complete(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        var order=orders.owned(id,user);
        if("completed".equals(order.get("status"))) return order;
        Db.require(!db.exists("SELECT id FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending')",id),CONFLICT,"A payment is in progress. Verify its status before completing checkout");
        orders.validate(id,user);
        Db.require(((BigDecimal)order.get("amount")).signum()==0,CONFLICT,"Paid checkout requires verified payment");
        orders.fulfill(id,user); return orders.owned(id,user);
    }
}
