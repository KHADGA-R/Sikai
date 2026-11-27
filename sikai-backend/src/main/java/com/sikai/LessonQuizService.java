package com.sikai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.*;

import static org.springframework.http.HttpStatus.*;

@Service
public class LessonQuizService {
    record Question(String prompt, List<String> options, Integer correct, String feedback) {}
    private final Db db;
    private final ObjectMapper mapper;
    private final NotificationService notifications;

    public LessonQuizService(Db db, ObjectMapper mapper, NotificationService notifications) {
        this.db = db;
        this.mapper = mapper;
        this.notifications = notifications;
    }

    List<Question> questions(Object quiz) {
        if (quiz == null) return List.of();
        try { return mapper.readValue((String) quiz, new TypeReference<>() {}); }
        catch (Exception error) { throw new IllegalStateException("Invalid saved quiz", error); }
    }

    void save(long lessonId, JsonNode quiz) {
        if (quiz.isNull() || (quiz.isArray() && quiz.isEmpty())) {
            db.update("UPDATE lesson SET quiz=NULL WHERE id=?", lessonId);
            return;
        }
        List<Question> questions;
        try { questions = mapper.convertValue(quiz, new TypeReference<>() {}); }
        catch (IllegalArgumentException error) { throw new org.springframework.web.server.ResponseStatusException(BAD_REQUEST, "Invalid quiz questions"); }
        Db.require(questions != null && questions.size() >= 2 && questions.size() <= 5, BAD_REQUEST, "Add 2 to 5 questions per quiz");
        for (var q : questions) {
            Db.require(q != null && validText(q.prompt(), 500) && q.options() != null &&
                q.options().size() >= 2 && q.options().size() <= 5 &&
                q.options().stream().allMatch(option -> validText(option, 240)) &&
                q.options().stream().map(option -> option.strip().toLowerCase(Locale.ROOT)).distinct().count() == q.options().size() &&
                q.correct() != null && q.correct() >= 0 && q.correct() < q.options().size() &&
                (q.feedback() == null || q.feedback().length() <= 500), BAD_REQUEST,
                "Each quiz question needs a prompt, distinct choices, and a correct answer");
        }
        db.update("UPDATE lesson SET quiz=? WHERE id=?", quiz.toString(), lessonId);
    }

    private boolean validText(String text, int max) { return text != null && !text.isBlank() && text.length() <= max; }

    boolean manages(long courseId, AuthService.User user) {
        return user != null && (user.role().equals("admin") ||
            (user.role().equals("instructor") && db.exists("SELECT id FROM course WHERE id=? AND owner_id=?", courseId, user.id())));
    }

    /** A learner must pass every earlier quiz in the same ordering used by curriculum navigation. */
    Set<Long> locked(long courseId, String userId) {
        var lessons = db.list("""
            SELECT l.id,(l.quiz IS NOT NULL) AS has_quiz,EXISTS(
                SELECT 1 FROM lesson_quiz_attempt a WHERE a.lesson_id=l.id AND a.user_id=? AND a.passed
            ) AS passed
            FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=?
            ORDER BY t.position,t.id,l.position,l.id
            """, userId, courseId);
        Set<Long> locked = new HashSet<>();
        boolean blocked = false;
        for (var lesson : lessons) {
            if (blocked) locked.add(((Number) lesson.get("id")).longValue());
            blocked |= Boolean.TRUE.equals(lesson.get("has_quiz")) && !Boolean.TRUE.equals(lesson.get("passed"));
        }
        return locked;
    }

    void requireUnlocked(long courseId, long lessonId, AuthService.User user) {
        if (!manages(courseId, user)) {
            Db.require(!locked(courseId, user == null ? null : user.id()).contains(lessonId),
                FORBIDDEN, "Pass the earlier lesson quiz to unlock this lesson");
        }
    }

    boolean passed(long lessonId, String userId) {
        return db.exists("SELECT id FROM lesson_quiz_attempt WHERE lesson_id=? AND user_id=? AND passed", lessonId, userId);
    }

    /** Caller holds the authenticated learner's row lock. */
    void complete(long courseId, long lessonId, AuthService.User user) {
        if (!db.exists("SELECT 1 FROM progress WHERE user_id=? AND lesson_id=?", user.id(), lessonId)) {
            db.update("INSERT INTO progress(user_id,lesson_id,completed_at) VALUES (?,?,?)",
                user.id(), lessonId, System.currentTimeMillis());
            notifications.completed(courseId, user);
        }
    }
}
