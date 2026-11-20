package com.sikai;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

/** User-scoped learning state. PUT and DELETE are idempotent instead of ambiguous toggles. */
@RestController
@RequestMapping("/api/me")
public class LearningController {
    private final Db db; private final CatalogService catalog;
    private final NotificationService notifications;

    /** Connect personal learning routes to authenticated course access and parameterized persistence. */
    public LearningController(Db db,CatalogService catalog,NotificationService notifications) { this.db=db; this.catalog=catalog; this.notifications=notifications; }

    /** Return the principal's saved courses that are still published. */
    @GetMapping("/wishlist") public Object wishlist(@AuthenticationPrincipal AuthService.User user) { return db.list(CatalogService.SELECT+" JOIN wishlist w ON w.course_id=c.id WHERE w.user_id=? AND c.published=TRUE ORDER BY c.id",user.id()); }

    /** Serialize this user's add operation and insert a visible course only when it is not already saved. */
    @PutMapping("/wishlist/{courseId}") @Transactional public Object wish(@PathVariable long courseId,@AuthenticationPrincipal AuthService.User user) {
        catalog.course(courseId,user); lockUser(user);
        if(!db.exists("SELECT user_id FROM wishlist WHERE user_id=? AND course_id=?",user.id(),courseId)) db.update("INSERT INTO wishlist(user_id,course_id) VALUES (?,?)",user.id(),courseId);
        return Map.of("success",true);
    }

    /** Idempotently remove only the current user's wishlist entry. */
    @DeleteMapping("/wishlist/{courseId}") public Object unwish(@PathVariable long courseId,@AuthenticationPrincipal AuthService.User user) { db.update("DELETE FROM wishlist WHERE user_id=? AND course_id=?",user.id(),courseId); return Map.of("success",true); }

    /** List persisted enrolled courses for the authenticated user. */
    @GetMapping("/enrollments") public Object enrollments(@AuthenticationPrincipal AuthService.User user) { return db.list(CatalogService.SELECT+" JOIN enrollment e ON e.course_id=c.id WHERE e.user_id=? ORDER BY c.id",user.id()); }

    /**
     * Idempotently enroll in a published free course; new paid access is rejected until verified
     * payment exists.
     */
    @PutMapping("/enrollments/{courseId}") @Transactional public Object enroll(@PathVariable long courseId,@AuthenticationPrincipal AuthService.User user) {
        var course=catalog.course(courseId,user); lockUser(user);
        Db.require(Boolean.TRUE.equals(course.get("published")),CONFLICT,"Course is not published");
        boolean exists=db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),courseId);
        Db.require(exists || ((BigDecimal)course.get("price")).signum()==0,CONFLICT,"Paid enrollment requires a payment integration; no payment has been collected");
        if(!exists) { db.update("INSERT INTO enrollment(user_id,course_id) VALUES (?,?)",user.id(),courseId); notifications.enrolled(courseId,user); }
        return Map.of("success",true);
    }

    /** Group the principal's real completed lesson IDs by their owning course ID. */
    @GetMapping("/progress") public Object progress(@AuthenticationPrincipal AuthService.User user) {
        var result=new LinkedHashMap<String,List<Long>>();
        for(var row:db.list("SELECT t.course_id,l.id FROM progress p JOIN lesson l ON l.id=p.lesson_id JOIN topic t ON t.id=l.topic_id WHERE p.user_id=? ORDER BY l.id",user.id())) result.computeIfAbsent(row.get("course_id").toString(),key->new ArrayList<>()).add(((Number)row.get("id")).longValue());
        return result;
    }

    /** Verify course access and lesson membership, then record completion once under a user-row lock. */
    @PutMapping("/progress/{courseId}/lessons/{lessonId}") @Transactional
    public Object complete(@PathVariable long courseId,@PathVariable long lessonId,@AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId,user); lockUser(user);
        Db.require(db.exists("SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?",lessonId,courseId),NOT_FOUND,"Lesson not found in course");
        if(!db.exists("SELECT user_id FROM progress WHERE user_id=? AND lesson_id=?",user.id(),lessonId)) {
            db.update("INSERT INTO progress(user_id,lesson_id,completed_at) VALUES (?,?,?)",
                user.id(),lessonId,System.currentTimeMillis());
            notifications.completed(courseId,user);
        }
        return Map.of("success",true);
    }

    /** Remove completion only when the requested lesson belongs to the specified accessible course. */
    @DeleteMapping("/progress/{courseId}/lessons/{lessonId}")
    public Object uncomplete(@PathVariable long courseId,@PathVariable long lessonId,@AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId,user);
        db.update("DELETE FROM progress WHERE user_id=? AND lesson_id=? AND lesson_id IN (SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=?)",user.id(),lessonId,courseId);
        return Map.of("success",true);
    }

    /** Lock the principal's user row inside a transaction to serialize duplicate learning-state additions. */
    private void lockUser(AuthService.User user) { db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id()); }
}
