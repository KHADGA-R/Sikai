package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/courses/{courseId}/assignments")
public class AssignmentActivityController {
    public record Target(@Positive int id, @NotBlank @Size(max=100) String label) {}
    public record Card(@Positive int id, @NotBlank @Size(max=80) String label, @Positive int targetId) {}
    public record Definition(@NotNull @Pattern(regexp="match|sort") String mode,
                             @NotNull @Size(min=2,max=12) List<@NotNull @Valid Target> targets,
                             @NotNull @Size(min=2,max=30) List<@NotNull @Valid Card> cards) {}
    public record Publish(@NotNull @Valid AssignmentController.AssignmentInput assignment,
                          @NotNull @Valid Definition activity) {}

    private final Db db;
    private final CatalogService catalog;
    private final ObjectMapper json;

    public AssignmentActivityController(Db db, CatalogService catalog, ObjectMapper json) {
        this.db = db;
        this.catalog = catalog;
        this.json = json;
    }

    @PostMapping("/activities")
    public Object publish(@PathVariable long courseId, @Valid @RequestBody Publish input,
                          @AuthenticationPrincipal AuthService.User user) throws Exception {
        catalog.owner(courseId, user);
        var assignment = input.assignment();
        var activity = input.activity();
        Db.require(assignment.lessonId() == null || db.exists("""
            SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?
            """, assignment.lessonId(), courseId), BAD_REQUEST, "Choose a lesson from this course");
        var targets = new HashSet<Integer>();
        for (var target : activity.targets()) {
            Db.require(targets.add(target.id()), BAD_REQUEST, "Each target needs a unique ID");
        }
        var cardIds = new HashSet<Integer>();
        var matchedTargets = new HashSet<Integer>();
        for (var card : activity.cards()) {
            Db.require(cardIds.add(card.id()) && targets.contains(card.targetId()), BAD_REQUEST,
                "Each card needs a unique ID and a valid target");
            Db.require(matchedTargets.add(card.targetId()) || activity.mode().equals("sort"), BAD_REQUEST,
                "Match activities accept one answer per target");
        }
        Db.require(activity.mode().equals("sort") || matchedTargets.size() == targets.size(), BAD_REQUEST,
            "Give each matching target one answer");
        String id = Db.id();
        db.update("""
            INSERT INTO course_assignment(id,course_id,lesson_id,kind,title,instructions,due_at,published_at,activity_definition,max_points)
            VALUES(?,?,?,?,?,?,?,?,?,?)
            """, id, courseId, assignment.lessonId(), assignment.kind(), assignment.title().trim(),
            assignment.instructions().trim(), assignment.dueAt(), System.currentTimeMillis(), json.writeValueAsString(activity), assignment.maxPoints());
        return Map.of("id", id);
    }

    @GetMapping("/{id}/activity")
    public Object activity(@PathVariable long courseId, @PathVariable String id,
                           @AuthenticationPrincipal AuthService.User user) throws Exception {
        catalog.accessContent(courseId, user);
        var record = db.one("""
            SELECT title,instructions,activity_definition,max_points FROM course_assignment
            WHERE id=? AND course_id=? AND activity_definition IS NOT NULL
            """, id, courseId);
        return playable(record, json.readValue((String) record.get("activity_definition"), Definition.class));
    }

    static Map<String,Object> playable(Map<String,Object> record, Definition definition) {
        var cards = definition.cards().stream().map(card -> Map.of("id", card.id(), "label", card.label().trim())).toList();
        return Map.of("title", record.get("title"), "instructions", record.get("instructions"),
            "mode", definition.mode(), "targets", definition.targets(), "cards", cards, "graded", record.get("max_points") != null);
    }
}
