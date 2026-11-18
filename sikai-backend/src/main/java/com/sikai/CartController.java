package com.sikai;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api/me/cart")
public class CartController {
    private final Db db; private final CatalogService catalog;
    public CartController(Db db,CatalogService catalog) { this.db=db; this.catalog=catalog; }
    @GetMapping public Object cart(@AuthenticationPrincipal AuthService.User user) {
        return db.list(CatalogService.SELECT+" JOIN cart_item i ON i.course_id=c.id WHERE i.user_id=? AND c.published=TRUE AND NOT EXISTS (SELECT 1 FROM enrollment e WHERE e.user_id=? AND e.course_id=c.id) ORDER BY c.id",user.id(),user.id());
    }
    @PutMapping("/{id}") @Transactional
    public Object add(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        db.update("DELETE FROM cart_item WHERE user_id=? AND (course_id IN (SELECT id FROM course WHERE published=FALSE) OR course_id IN (SELECT course_id FROM enrollment WHERE user_id=?))",user.id(),user.id());
        var course=catalog.course(id,user);
        Db.require(Boolean.TRUE.equals(course.get("published")),CONFLICT,"Course is not published");
        Db.require(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),id),CONFLICT,"This course is already in your learning library");
        if(!db.exists("SELECT user_id FROM cart_item WHERE user_id=? AND course_id=?",user.id(),id)) {
            Db.require(((Number)db.one("SELECT COUNT(*) AS total FROM cart_item WHERE user_id=?",user.id()).get("total")).intValue()<20,CONFLICT,"Your cart can hold up to 20 courses");
            db.update("INSERT INTO cart_item(user_id,course_id) VALUES (?,?)",user.id(),id);
        }
        return Map.of("success",true);
    }
    @DeleteMapping("/{id}") @Transactional
    public Object remove(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
        db.update("DELETE FROM cart_item WHERE user_id=? AND course_id=?",user.id(),id); return Map.of("success",true);
    }
}
