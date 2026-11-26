package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/courses/{courseId}/assignments")
public class AssignmentActivityController {
    public record Target(@Positive int id, @NotBlank @Size(max=100) String label,
                         @DecimalMin("0") @DecimalMax("1") Double x,
                         @DecimalMin("0") @DecimalMax("1") Double y) {}
    public record Card(@Positive int id, @NotBlank @Size(max=80) String label, @Positive int targetId) {}
    public record Definition(@NotNull @Pattern(regexp="match|sort|label") String mode,
                             @NotNull @Size(min=2,max=12) List<@NotNull @Valid Target> targets,
                             @NotNull @Size(min=2,max=30) List<@NotNull @Valid Card> cards,
                             @Size(max=240) String imageAlt) {}
    public record Publish(@NotNull @Valid AssignmentController.AssignmentInput assignment,
                          @NotNull @Valid Definition activity, @Size(max=1400000) String image) {}

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
        boolean picture = "label".equals(activity.mode());
        Db.require(!picture || activity.imageAlt() != null && !activity.imageAlt().isBlank(),
            BAD_REQUEST, "Describe the picture for students");
        Db.require(picture ? validPicture(input.image()) : input.image() == null, BAD_REQUEST,
            "Choose a PNG or JPG up to 1 MB and 4096 pixels per side");
        Db.require(assignment.lessonId() == null || db.exists("""
            SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?
            """, assignment.lessonId(), courseId), BAD_REQUEST, "Choose a lesson from this course");
        var targets = new HashSet<Integer>();
        for (var target : activity.targets()) {
            Db.require(targets.add(target.id()), BAD_REQUEST, "Each target needs a unique ID");
            Db.require(!picture || target.x() != null && target.y() != null, BAD_REQUEST, "Place every target on the picture");
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
            INSERT INTO course_assignment(id,course_id,lesson_id,kind,title,instructions,due_at,published_at,activity_definition,max_points,activity_image)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
            """, id, courseId, assignment.lessonId(), assignment.kind(), assignment.title().trim(),
            assignment.instructions().trim(), assignment.dueAt(), System.currentTimeMillis(), json.writeValueAsString(activity),
            assignment.maxPoints(), input.image());
        return Map.of("id", id);
    }

    @GetMapping("/{id}/activity")
    public Object activity(@PathVariable long courseId, @PathVariable String id,
                           @AuthenticationPrincipal AuthService.User user) throws Exception {
        catalog.accessContent(courseId, user);
        var record = db.one("""
            SELECT title,instructions,activity_definition,max_points,activity_image FROM course_assignment
            WHERE id=? AND course_id=? AND activity_definition IS NOT NULL
            """, id, courseId);
        return playable(record, json.readValue((String) record.get("activity_definition"), Definition.class));
    }

    static Map<String,Object> playable(Map<String,Object> record, Definition definition) {
        var cards = definition.cards().stream().map(card -> Map.of("id", card.id(), "label", card.label().trim())).toList();
        var result = new HashMap<String,Object>(Map.of("title", record.get("title"), "instructions", record.get("instructions"),
            "mode", definition.mode(), "targets", definition.targets(), "cards", cards, "graded", record.get("max_points") != null));
        if (definition.imageAlt() != null) result.put("imageAlt", definition.imageAlt());
        if (record.get("activity_image") != null) result.put("image", record.get("activity_image"));
        return result;
    }

    private boolean validPicture(String image) {
        if (image == null) return false;
        String format;
        if (image.startsWith("data:image/png;base64,")) format = "png";
        else if (image.startsWith("data:image/jpeg;base64,")) format = "jpeg";
        else return false;
        try {
            byte[] bytes = Base64.getDecoder().decode(image.substring(image.indexOf(',') + 1));
            if (bytes.length > 1024 * 1024) return false;
            try (var stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) return false;
                var reader = readers.next();
                try {
                    reader.setInput(stream);
                    return format.equalsIgnoreCase(reader.getFormatName())
                        && reader.getWidth(0) <= 4096 && reader.getHeight(0) <= 4096;
                } finally { reader.dispose(); }
            }
        } catch (IOException | IllegalArgumentException error) {
            return false;
        }
    }
}
