package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api/courses/{courseId}/learning")
public class LessonToolsController {
    private final Db db;
    private final CatalogService catalog;
    private final LessonQuizService quizzes;

    public LessonToolsController(Db db, CatalogService catalog, LessonQuizService quizzes) {
        this.db = db;
        this.catalog = catalog;
        this.quizzes = quizzes;
    }

    record Entry(@NotBlank @Size(max=3000) String body, @PositiveOrZero Integer seconds) {}
    record Message(@NotBlank @Size(max=3000) String body) {}
    record Announcement(@NotBlank @Size(max=160) String title, @NotBlank @Size(max=3000) String body) {}

    @GetMapping("/questions")
    public Object questions(@PathVariable long courseId, @RequestParam(required=false) Long lessonId,
                            @AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId, user);
        return db.list("""
            SELECT q.id,q.body,q.seconds,q.answer,q.created_at AS "createdAt",u.name AS author,
                   l.id AS "lessonId",l.title AS "lessonTitle"
            FROM lesson_question q JOIN app_user u ON u.id=q.author_id
            JOIN lesson l ON l.id=q.lesson_id JOIN topic t ON t.id=l.topic_id
            WHERE t.course_id=?
            """ + (lessonId == null ? "" : " AND l.id=?") + " ORDER BY q.created_at DESC,q.id",
            lessonId == null ? new Object[]{courseId} : new Object[]{courseId,lessonId});
    }

    @PostMapping("/lessons/{lessonId}/questions")
    @ResponseStatus(CREATED)
    public void ask(@PathVariable long courseId, @PathVariable long lessonId, @Valid @RequestBody Entry entry,
                    @AuthenticationPrincipal AuthService.User user) {
        requireLesson(courseId, lessonId, user);
        db.update("INSERT INTO lesson_question(id,lesson_id,author_id,body,seconds,created_at) VALUES (?,?,?,?,?,?)",
            Db.id(), lessonId, user.id(), entry.body().strip(), entry.seconds(), System.currentTimeMillis());
    }

    @PutMapping("/questions/{id}/answer")
    public void answer(@PathVariable long courseId, @PathVariable String id, @Valid @RequestBody Message message,
                       @AuthenticationPrincipal AuthService.User user) {
        catalog.owner(courseId, user);
        Db.require(db.update("""
            UPDATE lesson_question SET answer=? WHERE id=? AND lesson_id IN
            (SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=?)
            """, message.body().strip(), id, courseId) == 1, NOT_FOUND, "Question not found");
    }

    @GetMapping("/lessons/{lessonId}/notes")
    public Object notes(@PathVariable long courseId, @PathVariable long lessonId, @AuthenticationPrincipal AuthService.User user) {
        requireLesson(courseId, lessonId, user);
        return db.list("""
            SELECT id,body,seconds,created_at AS "createdAt" FROM lesson_note
            WHERE lesson_id=? AND user_id=? ORDER BY seconds,created_at
            """, lessonId, user.id());
    }

    @PostMapping("/lessons/{lessonId}/notes")
    @ResponseStatus(CREATED)
    public void addNote(@PathVariable long courseId, @PathVariable long lessonId, @Valid @RequestBody Entry entry,
                        @AuthenticationPrincipal AuthService.User user) {
        requireLesson(courseId, lessonId, user);
        db.update("INSERT INTO lesson_note(id,lesson_id,user_id,body,seconds,created_at) VALUES (?,?,?,?,?,?)",
            Db.id(), lessonId, user.id(), entry.body().strip(), entry.seconds(), System.currentTimeMillis());
    }

    @PutMapping("/lessons/{lessonId}/notes/{id}")
    public void updateNote(@PathVariable long courseId, @PathVariable long lessonId, @PathVariable String id,
                           @Valid @RequestBody Message message, @AuthenticationPrincipal AuthService.User user) {
        requireLesson(courseId, lessonId, user);
        Db.require(db.update("UPDATE lesson_note SET body=? WHERE id=? AND lesson_id=? AND user_id=?",
            message.body().strip(), id, lessonId, user.id()) == 1, NOT_FOUND, "Note not found");
    }

    @DeleteMapping("/lessons/{lessonId}/notes/{id}")
    public void deleteNote(@PathVariable long courseId, @PathVariable long lessonId, @PathVariable String id,
                           @AuthenticationPrincipal AuthService.User user) {
        requireLesson(courseId, lessonId, user);
        Db.require(db.update("DELETE FROM lesson_note WHERE id=? AND lesson_id=? AND user_id=?",
            id, lessonId, user.id()) == 1, NOT_FOUND, "Note not found");
    }

    @GetMapping("/announcements")
    public Object announcements(@PathVariable long courseId, @AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId, user);
        return db.list("""
            SELECT a.id,a.title,a.body,a.created_at AS "createdAt",(r.user_id IS NULL) AS unread
            FROM course_announcement a LEFT JOIN course_announcement_read r ON r.announcement_id=a.id AND r.user_id=?
            WHERE a.course_id=? ORDER BY a.created_at DESC,a.id
            """, user.id(), courseId);
    }

    @PostMapping("/announcements")
    @ResponseStatus(CREATED)
    public void announce(@PathVariable long courseId, @Valid @RequestBody Announcement message,
                         @AuthenticationPrincipal AuthService.User user) {
        catalog.owner(courseId, user);
        db.update("INSERT INTO course_announcement(id,course_id,title,body,created_at) VALUES (?,?,?,?,?)",
            Db.id(), courseId, message.title().strip(), message.body().strip(), System.currentTimeMillis());
    }

    @PutMapping("/announcements/{id}/read")
    @Transactional
    public void markRead(@PathVariable long courseId, @PathVariable String id, @AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId, user);
        db.one("SELECT id FROM course_announcement WHERE id=? AND course_id=? FOR UPDATE", id, courseId);
        if (!db.exists("SELECT 1 FROM course_announcement_read WHERE announcement_id=? AND user_id=?", id, user.id())) {
            db.update("INSERT INTO course_announcement_read(announcement_id,user_id) VALUES (?,?)", id, user.id());
        }
    }

    private void requireLesson(long courseId, long lessonId, AuthService.User user) {
        catalog.accessContent(courseId, user);
        Db.require(db.exists("SELECT 1 FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?",
            lessonId, courseId), NOT_FOUND, "Lesson not found");
        quizzes.requireUnlocked(courseId, lessonId, user);
    }
}
