package com.sikai;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

/** Authoritative line-item snapshots and atomic enrollment for single- and multi-course orders. */
@Service
public class CheckoutOrders {
    private final Db db;
    private final CatalogService catalog;
    private final NotificationService notifications;
    private static final String SELECT="SELECT id,course_id AS \"courseId\",course_title AS \"courseTitle\",amount,currency,status,created_at AS \"createdAt\",completed_at AS \"completedAt\" FROM checkout_order";
    public CheckoutOrders(Db db,CatalogService catalog,NotificationService notifications) { this.db=db; this.catalog=catalog; this.notifications=notifications; }

    public List<Map<String,Object>> items(String orderId) {
        return db.list("SELECT course_id AS \"courseId\",course_title AS title,amount FROM checkout_order_item WHERE order_id=? ORDER BY course_id",orderId);
    }
    public Map<String,Object> owned(String id,AuthService.User user) {
        var order=db.one(SELECT+" WHERE id=? AND user_id=?",id,user.id()); order.put("items",items(id)); return order;
    }
    @Transactional
    public Map<String,Object> create(List<Long> requested,AuthService.User user) {
        Db.require(requested!=null && !requested.isEmpty() && requested.size()<=20,BAD_REQUEST,"Choose between 1 and 20 courses");
        Db.require(requested.stream().allMatch(id->id!=null && id>0),BAD_REQUEST,"Invalid course selection");
        var ids=requested.stream().distinct().sorted().toList();
        String key="courses:"+ids.stream().map(Object::toString).collect(Collectors.joining(","));
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        var existing=db.list("SELECT id,status FROM checkout_order WHERE user_id=? AND basket_key=?",user.id(),key);
        String id=existing.isEmpty()?Db.id():existing.get(0).get("id").toString();
        if(!existing.isEmpty() && ("completed".equals(existing.get(0).get("status")) || db.exists("SELECT id FROM checkout_payment WHERE order_id=? AND status IN ('creating','pending','completed')",id))) return owned(id,user);
        var courses=new ArrayList<Map<String,Object>>(); BigDecimal total=BigDecimal.ZERO;
        for(long courseId:ids) {
            db.one("SELECT id FROM course WHERE id=? FOR UPDATE",courseId);
            var course=catalog.course(courseId,user);
            Db.require(Boolean.TRUE.equals(course.get("published")),CONFLICT,"A selected course is not published");
            Db.require(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),courseId),CONFLICT,"You are already enrolled in "+course.get("title"));
            ensureNoOtherPayment(courseId,id,user);
            total=total.add((BigDecimal)course.get("price")); courses.add(course);
        }
        Db.require(total.compareTo(new BigDecimal("9999999999.99"))<=0,BAD_REQUEST,"Checkout total exceeds the maximum supported amount");
        String title=courses.size()==1?courses.get(0).get("title").toString():courses.size()+" Sikai courses";
        if(existing.isEmpty()) db.update("INSERT INTO checkout_order(id,user_id,course_id,course_title,amount,currency,status,created_at,basket_key) VALUES (?,?,?,?,?,'USD','pending',?,?)",id,user.id(),ids.get(0),title,total,System.currentTimeMillis(),key);
        else { db.update("UPDATE checkout_order SET amount=?,course_title=? WHERE id=?",total,title,id); db.update("DELETE FROM checkout_order_item WHERE order_id=?",id); }
        for(var course:courses) db.update("INSERT INTO checkout_order_item(order_id,course_id,course_title,amount) VALUES (?,?,?,?)",id,course.get("id"),course.get("title"),course.get("price"));
        return owned(id,user);
    }
    /** Called under the buyer lock before any new payment or free fulfillment. */
    public void validate(String orderId,AuthService.User user) {
        var order=owned(orderId,user); var lines=items(orderId); BigDecimal total=BigDecimal.ZERO;
        Db.require(!lines.isEmpty(),CONFLICT,"Checkout has no courses");
        for(var item:lines) {
            long id=((Number)item.get("courseId")).longValue();
            var course=db.one("SELECT price,published FROM course WHERE id=? FOR UPDATE",id);
            Db.require(Boolean.TRUE.equals(course.get("published")),CONFLICT,"A course is no longer available. Review your cart");
            Db.require(((BigDecimal)course.get("price")).compareTo((BigDecimal)item.get("amount"))==0,CONFLICT,"A course price changed. Return to your cart to review the new total");
            Db.require(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),id),CONFLICT,"A course is already in your learning library. Review your cart");
            ensureNoOtherPayment(id,orderId,user); total=total.add((BigDecimal)item.get("amount"));
        }
        Db.require(total.compareTo((BigDecimal)order.get("amount"))==0,CONFLICT,"Checkout total changed. Review your cart");
    }
    private void ensureNoOtherPayment(long courseId,String orderId,AuthService.User user) {
        Db.require(!db.exists("SELECT p.id FROM checkout_payment p JOIN checkout_order o ON o.id=p.order_id JOIN checkout_order_item i ON i.order_id=o.id WHERE o.user_id=? AND i.course_id=? AND o.id<>? AND p.status IN ('creating','pending')",user.id(),courseId,orderId),CONFLICT,"Another checkout with this course has a payment in progress. Resume it from your cart");
    }
    /** Caller holds the buyer lock; all items and the receipt commit in the same transaction. */
    public void fulfill(String orderId,AuthService.User user) {
        for(var item:items(orderId)) {
            long courseId=((Number)item.get("courseId")).longValue();
            if(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),courseId)) {
                db.update("INSERT INTO enrollment(user_id,course_id) VALUES (?,?)",user.id(),courseId);
                notifications.enrolled(courseId,user);
            }
            db.update("DELETE FROM cart_item WHERE user_id=? AND course_id=?",user.id(),courseId);
        }
        db.update("UPDATE checkout_order SET status='completed',completed_at=? WHERE id=?",System.currentTimeMillis(),orderId);
    }
}
