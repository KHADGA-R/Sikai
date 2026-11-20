package com.sikai;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api")
public class CertificateController {
    private static final String DETAILS = """
        id, recipient, course_title AS "courseTitle", issued_at AS "issuedAt",
        instructor, duration_hours AS "durationHours", course_level AS "level", completed_at AS "completedAt"
        """;
    private static final String SELECT =
        "SELECT " + DETAILS + ", course_id AS \"courseId\", shared FROM course_certificate";
    private final Db db;

    public CertificateController(Db db) {
        this.db = db;
    }

    @GetMapping("/me/certificates")
    public Object list(@AuthenticationPrincipal AuthService.User user) {
        return db.list(SELECT + " WHERE user_id=? ORDER BY issued_at DESC", user.id());
    }

    @GetMapping("/me/certificates/{courseId}")
    public Object get(@PathVariable long courseId, @AuthenticationPrincipal AuthService.User user) {
        return db.one(SELECT + " WHERE user_id=? AND course_id=?", user.id(), courseId);
    }

    @PutMapping("/me/certificates/{courseId}")
    @Transactional
    public Object issue(@PathVariable long courseId, @AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE", user.id());
        var existing = db.list(SELECT + " WHERE user_id=? AND course_id=?", user.id(), courseId);
        if (!existing.isEmpty()) return existing.get(0);

        int inserted = db.update("""
            INSERT INTO course_certificate (id, user_id, course_id, recipient, course_title, issued_at,
                                            instructor, duration_hours, course_level, completed_at)
            SELECT ?, e.user_id, c.id, u.name, c.title, ?, teacher.name, c.duration_hours, c.level,
                   (SELECT MAX(p.completed_at) FROM progress p JOIN lesson l ON l.id=p.lesson_id
                    JOIN topic t ON t.id=l.topic_id WHERE p.user_id=e.user_id AND t.course_id=c.id)
            FROM enrollment e JOIN course c ON c.id=e.course_id JOIN app_user u ON u.id=e.user_id
            JOIN app_user teacher ON teacher.id=c.owner_id
            WHERE e.user_id=? AND e.course_id=?
              AND EXISTS (SELECT 1 FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=c.id)
              AND NOT EXISTS (
                SELECT 1 FROM lesson l JOIN topic t ON t.id=l.topic_id
                WHERE t.course_id=c.id AND NOT EXISTS (
                    SELECT 1 FROM progress p WHERE p.user_id=e.user_id AND p.lesson_id=l.id
                )
              )
            """, Db.id(), System.currentTimeMillis(), user.id(), courseId);
        Db.require(inserted == 1, CONFLICT, "Complete every lesson in an enrolled course to earn its certificate");
        return db.one(SELECT + " WHERE user_id=? AND course_id=?", user.id(), courseId);
    }

    public record Sharing(boolean shared) {}

    @PatchMapping("/me/certificates/{id}")
    @Transactional
    public Object sharing(@PathVariable String id, @RequestBody Sharing sharing,
                          @AuthenticationPrincipal AuthService.User user) {
        Db.require(db.update("UPDATE course_certificate SET shared=? WHERE id=? AND user_id=?",
            sharing.shared(), id, user.id()) == 1, NOT_FOUND, "Certificate not found");
        return db.one(SELECT + " WHERE id=? AND user_id=?", id, user.id());
    }

    @GetMapping("/certificates/{id}")
    public Object verify(@PathVariable String id) {
        return db.one("SELECT " + DETAILS + " FROM course_certificate WHERE id=? AND shared=TRUE", id);
    }
}
