package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

/** Server-priced checkout orders. Only verified settlement may grant paid access. */
@RestController
@RequestMapping("/api/checkout")
public class CheckoutController {
    public record Input(@Positive long courseId) {}
    private static final String SELECT = "SELECT id,course_id AS \"courseId\",course_title AS \"courseTitle\",amount,currency,status,created_at AS \"createdAt\",completed_at AS \"completedAt\" FROM checkout_order";
    private final Db db;
    private final CatalogService catalog;
    private final PaymentService payments;

    public CheckoutController(Db db, CatalogService catalog, PaymentService payments) { this.db=db; this.catalog=catalog; this.payments=payments; }

    /** Quote from the catalog, never from a browser-supplied price. */
    @GetMapping("/courses/{courseId}")
    public Object quote(@PathVariable long courseId, @AuthenticationPrincipal AuthService.User user) {
        var course=published(courseId,user);
        return payments.quote(courseId,user,(BigDecimal)course.get("price"));
    }

    /** Reuse one order per account/course, preserving completed receipts across retries. */
    @PostMapping("/orders") @Transactional
    public Object create(@Valid @RequestBody Input input, @AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        var course=published(input.courseId(),user);
        var existing=db.list(SELECT+" WHERE user_id=? AND course_id=?",user.id(),input.courseId());
        if(!existing.isEmpty() && "completed".equals(existing.get(0).get("status"))) return existing.get(0);
        if(!existing.isEmpty() && db.exists("SELECT id FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending','completed')",existing.get(0).get("id"))) return existing.get(0);
        Db.require(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),input.courseId()),CONFLICT,"You are already enrolled in this course");
        String id=existing.isEmpty()?Db.id():existing.get(0).get("id").toString();
        if(existing.isEmpty()) db.update("INSERT INTO checkout_order(id,user_id,course_id,course_title,amount,currency,status,created_at) VALUES (?,?,?,?,?,'USD','pending',?)",id,user.id(),input.courseId(),course.get("title"),course.get("price"),System.currentTimeMillis());
        else db.update("UPDATE checkout_order SET course_title=?,amount=? WHERE id=?",course.get("title"),course.get("price"),id);
        return order(id,user);
    }

    /** Orders are visible only to their purchaser. */
    @GetMapping("/orders/{id}")
    public Map<String,Object> order(@PathVariable String id, @AuthenticationPrincipal AuthService.User user) {
        return db.one(SELECT+" WHERE id=? AND user_id=?",id,user.id());
    }

    /** Complete free checkout atomically; reject paid orders without verified payment. */
    @PostMapping("/orders/{id}/complete") @Transactional
    public Object complete(@PathVariable String id, @AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        var order=order(id,user);
        if("completed".equals(order.get("status"))) return order;
        Db.require(!db.exists("SELECT id FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending')",id),CONFLICT,"A payment is in progress. Verify its status before completing checkout");
        long courseId=((Number)order.get("courseId")).longValue();
        // Serialize with catalog updates so the price cannot change during completion.
        db.one("SELECT id FROM course WHERE id=? FOR UPDATE",courseId);
        var course=published(courseId,user);
        Db.require(((BigDecimal)order.get("amount")).compareTo((BigDecimal)course.get("price"))==0,CONFLICT,"Course price changed. Please review checkout again");
        Db.require(((BigDecimal)order.get("amount")).signum()==0,CONFLICT,"Online payments are not configured. No payment has been collected");
        if(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),courseId)) db.update("INSERT INTO enrollment(user_id,course_id) VALUES (?,?)",user.id(),courseId);
        db.update("UPDATE checkout_order SET status='completed',completed_at=? WHERE id=?",System.currentTimeMillis(),id);
        return order(id,user);
    }

    private Map<String,Object> published(long id, AuthService.User user) {
        var course=catalog.course(id,user);
        Db.require(Boolean.TRUE.equals(course.get("published")),CONFLICT,"Course is not published");
        return course;
    }
}
