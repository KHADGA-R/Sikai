package com.sikai;

import jakarta.validation.Valid;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

/** Public catalog and instructor/admin course management. */
@RestController
@RequestMapping("/api")
public class CatalogController {
    private final CatalogService catalog; private final Db db;

    /** Connect catalog HTTP routes to shared authorization and database operations. */
    public CatalogController(CatalogService catalog,Db db) { this.catalog=catalog; this.db=db; }

    /** Expose the category/subcategory taxonomy used by the frontend forms. */
    @GetMapping("/categories") public Object categories() { return catalog.categories(); }

    /** Return a bounded page of published courses using optional discovery filters. */
    @GetMapping("/courses") public Object courses(@RequestParam(required=false) String q,@RequestParam(required=false) String category,@RequestParam(required=false) String level,@RequestParam(required=false) Integer grade,@RequestParam(required=false) Boolean isFree,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return catalog.list(q,category,level,grade,isFree,page,size); }

    /** Return one visible course; draft visibility is restricted by the catalog service. */
    @GetMapping("/courses/{id}") public Object course(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) { return catalog.course(id,user); }

    /** List the authenticated instructor or administrator's own courses, including drafts. */
    @GetMapping("/instructor/courses") public Object mine(@AuthenticationPrincipal AuthService.User user) { catalog.instructor(user); return db.list(CatalogService.SELECT+" WHERE c.owner_id=? ORDER BY c.id DESC",user.id()); }

    /** Create a course owned by the principal and return its computed catalog projection. */
    @PostMapping("/instructor/courses") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object create(@Valid @RequestBody CatalogService.CourseInput input,@AuthenticationPrincipal AuthService.User user) { long id=catalog.create(input,user); return catalog.course(id,user); }

    /** Replace editable course fields after ownership checks and return the updated projection. */
    @PutMapping("/instructor/courses/{id}") public Object update(@PathVariable long id,@Valid @RequestBody CatalogService.CourseInput input,@AuthenticationPrincipal AuthService.User user) { catalog.update(id,input,user); return catalog.course(id,user); }

    /** Verify ownership before deleting the course and database-cascaded learning/content records. */
    @DeleteMapping("/instructor/courses/{id}") @Transactional
    public Object delete(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) {
        catalog.owner(id,user);
        db.one("SELECT id FROM course WHERE id=? FOR UPDATE",id);
        Db.require(!db.exists("SELECT p.id FROM checkout_payment p JOIN checkout_order_item i ON i.order_id=p.order_id WHERE i.course_id=?",id),org.springframework.http.HttpStatus.CONFLICT,"Courses with payment records cannot be deleted. Unpublish the course instead");
        db.update("DELETE FROM course WHERE id=?",id); return Map.of("success",true);
    }

    /** List all courses for an administrator; the security filter protects this route. */
    @GetMapping("/admin/courses") public Object adminCourses() { return db.list(CatalogService.SELECT+" ORDER BY c.id"); }

    /** List public account fields for administrators without authentication secrets. */
    @GetMapping("/admin/users") public Object users() { return db.list("SELECT id,name,email,role FROM app_user ORDER BY email"); }

    /** Return platform counts from persisted users, courses, enrollments and bookings. */
    @GetMapping("/admin/stats") public Object stats() {
        return Map.of("users",db.one("SELECT COUNT(*) AS total FROM app_user").get("total"),"courses",db.one("SELECT COUNT(*) AS total FROM course").get("total"),"enrollments",db.one("SELECT COUNT(*) AS total FROM enrollment").get("total"),"bookings",db.one("SELECT COUNT(*) AS total FROM booking").get("total"));
    }
}
