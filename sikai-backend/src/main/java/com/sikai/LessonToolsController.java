package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
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
        String condition = lessonId == null ? "" : " AND l.id=?";
        var rows = db.list("""
            SELECT q.id,q.body,q.seconds,q.created_at AS "createdAt",u.name AS author,
                   l.id AS "lessonId",l.title AS "lessonTitle",
                   (SELECT COUNT(*) FROM lesson_question_vote v WHERE v.question_id=q.id) AS "voteCount",
                   EXISTS(SELECT 1 FROM lesson_question_vote v WHERE v.question_id=q.id AND v.user_id=?) AS voted,
                   (q.author_id<>?) AS "otherAuthor"
            FROM lesson_question q JOIN app_user u ON u.id=q.author_id
            JOIN lesson l ON l.id=q.lesson_id JOIN topic t ON t.id=l.topic_id
            WHERE t.course_id=?
            """ + condition + " ORDER BY q.created_at DESC,q.id",
            lessonId == null ? new Object[]{user.id(),user.id(),courseId} : new Object[]{user.id(),user.id(),courseId,lessonId});
        var replies = db.list("""
            SELECT r.id,r.question_id AS "questionId",r.body,r.created_at AS "createdAt",u.name AS author,
                   (u.id=c.owner_id OR u.role='admin') AS teacher,(r.author_id=?) AS "canEdit"
            FROM lesson_question_reply r JOIN app_user u ON u.id=r.author_id
            JOIN lesson_question q ON q.id=r.question_id JOIN lesson l ON l.id=q.lesson_id
            JOIN topic t ON t.id=l.topic_id JOIN course c ON c.id=t.course_id WHERE t.course_id=?
            """ + condition + " ORDER BY r.created_at,r.id",
            lessonId == null ? new Object[]{user.id(),courseId} : new Object[]{user.id(),courseId,lessonId});
        Map<Object,List<Map<String,Object>>> byQuestion = new HashMap<>();
        for (var reply : replies) byQuestion.computeIfAbsent(reply.remove("questionId"), key -> new ArrayList<>()).add(reply);
        for (var row : rows) {
            boolean otherAuthor = Boolean.TRUE.equals(row.remove("otherAuthor"));
            row.put("canVote", otherAuthor && user.role().equals("student"));
            row.put("replies", byQuestion.getOrDefault(row.get("id"), List.of()));
        }
        return rows;
    }

    @PostMapping("/lessons/{lessonId}/questions")
    @ResponseStatus(CREATED)
    public void ask(@PathVariable long courseId, @PathVariable long lessonId, @Valid @RequestBody Entry entry,
                    @AuthenticationPrincipal AuthService.User user) {
        requireLesson(courseId, lessonId, user);
        db.update("INSERT INTO lesson_question(id,lesson_id,author_id,body,seconds,created_at) VALUES (?,?,?,?,?,?)",
            Db.id(), lessonId, user.id(), entry.body().strip(), entry.seconds(), System.currentTimeMillis());
    }

    @PostMapping("/questions/{id}/replies")
    @ResponseStatus(CREATED)
    public void reply(@PathVariable long courseId, @PathVariable String id, @Valid @RequestBody Message message,
                      @AuthenticationPrincipal AuthService.User user) {
        question(courseId, id, user);
        db.update("INSERT INTO lesson_question_reply(id,question_id,author_id,body,created_at) VALUES (?,?,?,?,?)",
            Db.id(), id, user.id(), message.body().strip(), System.currentTimeMillis());
    }

    @PutMapping("/questions/{id}/replies/{replyId}")
    public void editReply(@PathVariable long courseId, @PathVariable String id, @PathVariable String replyId,
                          @Valid @RequestBody Message message, @AuthenticationPrincipal AuthService.User user) {
        question(courseId, id, user);
        Db.require(db.update("UPDATE lesson_question_reply SET body=? WHERE id=? AND question_id=? AND author_id=?",
            message.body().strip(), replyId, id, user.id()) == 1, NOT_FOUND, "Reply not found");
    }

    @PutMapping("/questions/{id}/vote")
    @Transactional
    public void vote(@PathVariable long courseId, @PathVariable String id, @AuthenticationPrincipal AuthService.User user) {
        var question = question(courseId, id, user);
        Db.require(user.role().equals("student") && !user.id().equals(question.get("author_id")), FORBIDDEN,
            "Students can upvote another person's question");
        db.one("SELECT id FROM lesson_question WHERE id=? FOR UPDATE", id);
        if (!db.exists("SELECT 1 FROM lesson_question_vote WHERE question_id=? AND user_id=?", id, user.id())) {
            db.update("INSERT INTO lesson_question_vote(question_id,user_id) VALUES (?,?)", id, user.id());
        }
    }

    private Map<String,Object> question(long courseId, String id, AuthService.User user) {
        var question = db.one("""
            SELECT q.lesson_id,q.author_id FROM lesson_question q JOIN lesson l ON l.id=q.lesson_id
            JOIN topic t ON t.id=l.topic_id WHERE q.id=? AND t.course_id=?
            """, id, courseId);
        requireLesson(courseId, ((Number)question.get("lesson_id")).longValue(), user);
        return question;
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
