package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api/courses/{courseId}/lessons/{lessonId}/quiz")
public class LessonQuizController {
    private final Db db;
    private final CatalogService catalog;
    private final LessonQuizService quizzes;

    public LessonQuizController(Db db, CatalogService catalog, LessonQuizService quizzes) {
        this.db = db;
        this.catalog = catalog;
        this.quizzes = quizzes;
    }

    record Submission(@NotNull @Size(min=2, max=5) List<@NotNull @PositiveOrZero Integer> answers) {}
    record Prompt(String prompt, List<String> options) {}
    record Feedback(boolean correct, String explanation) {}
    record Result(int correct, int total, boolean passed, List<Feedback> feedback) {}

    @GetMapping
    public Object get(@PathVariable long courseId, @PathVariable long lessonId, @AuthenticationPrincipal AuthService.User user) {
        var questions = questions(courseId, lessonId, user, false);
        return Map.of("questions", questions.stream().map(q -> new Prompt(q.prompt(), q.options())).toList(),
            "passed", quizzes.passed(lessonId, user.id()));
    }

    @PostMapping
    @Transactional
    public Result submit(@PathVariable long courseId, @PathVariable long lessonId,
                         @Valid @RequestBody Submission submission, @AuthenticationPrincipal AuthService.User user) {
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE", user.id());
        var questions = questions(courseId, lessonId, user, true);
        Db.require(submission.answers().size() == questions.size(), BAD_REQUEST, "Answer every question");
        List<Feedback> feedback = new ArrayList<>();
        int correct = 0;
        for (int i = 0; i < questions.size(); i++) {
            var question = questions.get(i);
            int choice = submission.answers().get(i);
            Db.require(choice < question.options().size(), BAD_REQUEST, "Choose a valid answer");
            boolean right = choice == question.correct();
            if (right) correct++;
            feedback.add(new Feedback(right, Objects.toString(question.feedback(), "")));
        }
        boolean passed = correct * 100 >= questions.size() * 90;
        if (!quizzes.manages(courseId, user)) {
            db.update("""
                INSERT INTO lesson_quiz_attempt(id,lesson_id,user_id,correct_count,question_count,passed,submitted_at)
                VALUES (?,?,?,?,?,?,?)
                """, Db.id(), lessonId, user.id(), correct, questions.size(), passed, System.currentTimeMillis());
            if (passed) quizzes.complete(courseId, lessonId, user);
        }
        return new Result(correct, questions.size(), passed, feedback);
    }

    private List<LessonQuizService.Question> questions(long courseId, long lessonId, AuthService.User user, boolean lock) {
        catalog.accessContent(courseId, user);
        var lesson = db.one("""
            SELECT l.quiz FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?
            """ + (lock ? " FOR UPDATE" : ""), lessonId, courseId);
        quizzes.requireUnlocked(courseId, lessonId, user);
        Db.require(lesson.get("quiz") != null, NOT_FOUND, "This lesson has no quiz");
        return quizzes.questions(lesson.get("quiz"));
    }
}
