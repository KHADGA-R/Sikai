package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import java.util.List;
import java.util.Set;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.FORBIDDEN;

@RestController
@RequestMapping("/api/courses/{courseId}/assignments")
public class AssignmentController {
    public record AssignmentInput(@NotBlank @Size(max=160) String title, @NotNull @Size(max=4000) String instructions,
                                  @NotNull @Pattern(regexp="homework|classwork") String kind,
                                  @Positive Long lessonId, @Positive Long dueAt, @Min(1) @Max(10000) Integer maxPoints) {}

    private static final System.Logger LOG = System.getLogger(AssignmentController.class.getName());
    private final Db db;
    private final CatalogService catalog;
    private final ContentController content;
    private final ObjectMapper json;

    public AssignmentController(Db db, CatalogService catalog, ContentController content, ObjectMapper json) {
        this.db = db;
        this.catalog = catalog;
        this.content = content;
        this.json = json;
    }

    public record Point(@NotNull @DecimalMin("0") @DecimalMax("1") Double x,
                        @NotNull @DecimalMin("0") @DecimalMax("1") Double y) {}
    public record Mark(@Positive @Max(100000) int page,
                       @NotNull @Pattern(regexp="pen|highlighter|line|arrow|rectangle|ellipse|circle|text") String tool,
                       @NotNull @Pattern(regexp="#[0-9a-fA-F]{6}") String color,
                       @NotNull @Size(min=1,max=128) List<@NotNull @Valid Point> points,
                       @Size(max=240) String text,
                       @Min(2) @Max(24) Integer width,
                       @Pattern(regexp="solid|dashed|dotted") String style) {}
    public record WorkspaceInput(@PositiveOrZero long revision,
                                 @NotNull @Size(max=400) List<@NotNull @Valid Mark> marks) {}

    @GetMapping("/{id}/workspace")
    public Object workspace(@PathVariable long courseId, @PathVariable String id,
                            @AuthenticationPrincipal AuthService.User user) throws Exception {
        requireStudent(courseId, user);
        var assignment = worksheetDetails(courseId, id);
        var rows = workspaceRows(id, user);
        boolean submitted = db.exists("SELECT assignment_id FROM assignment_submission WHERE assignment_id=? AND student_id=?", id, user.id());
        if (rows.isEmpty()) return Map.of("assignment", assignment, "revision", 0, "marks", List.of(), "submitted", submitted);
        var row = rows.get(0);
        return Map.of("assignment", assignment, "revision", row.get("revision"),
            "marks", json.readTree((String) row.get("annotations")), "submitted", submitted);
    }

    Map<String, Object> worksheetDetails(long courseId, String id) {
        return db.one("""
            SELECT a.title,a.instructions,f.file_name AS "fileName" FROM course_assignment a
            JOIN course_asset f ON f.id=a.asset_id WHERE a.course_id=? AND a.id=?
            """, courseId, id);
    }

    @PutMapping("/{id}/workspace")
    @Transactional
    public Object saveWorkspace(@PathVariable long courseId, @PathVariable String id,
                                @Valid @RequestBody WorkspaceInput input,
                                @AuthenticationPrincipal AuthService.User user) throws Exception {
        requireStudent(courseId, user);
        String annotations = json.writeValueAsString(input.marks());
        Db.require(annotations.length() <= 2000000, BAD_REQUEST, "The whiteboard has reached its storage limit");
        db.one("SELECT id FROM course_assignment WHERE course_id=? AND id=? FOR UPDATE", courseId, id);
        var rows = workspaceRows(id, user);
        long revision = rows.isEmpty() ? 0 : ((Number) rows.get(0).get("revision")).longValue();
        Db.require(revision == input.revision(), CONFLICT, "This whiteboard was updated in another tab");
        if (rows.isEmpty()) {
            db.update("INSERT INTO assignment_workspace(assignment_id,student_id,annotations,revision) VALUES(?,?,?,?)",
                id, user.id(), annotations, revision + 1);
        } else {
            db.update("UPDATE assignment_workspace SET annotations=?,revision=? WHERE assignment_id=? AND student_id=?",
                annotations, revision + 1, id, user.id());
        }
        return Map.of("revision", revision + 1);
    }

    private List<Map<String, Object>> workspaceRows(String id, AuthService.User user) {
        return db.list("SELECT annotations,revision FROM assignment_workspace WHERE assignment_id=? AND student_id=?", id, user.id());
    }

    void requireStudent(long courseId, AuthService.User user) {
        catalog.accessContent(courseId, user);
        Db.require(user.role().equals("student") && db.exists(
            "SELECT user_id FROM enrollment WHERE course_id=? AND user_id=?", courseId, user.id()),
            FORBIDDEN, "Enroll as a student to open this assignment whiteboard");
    }

    @GetMapping
    public Object list(@PathVariable long courseId, @AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId, user);
        var course = catalog.course(courseId, user);
        boolean canPublish = user.role().equals("admin") || user.role().equals("instructor") && user.id().equals(course.get("ownerId"));
        var assignments = db.list("""
            SELECT a.id,a.kind,a.title,a.instructions,a.due_at AS "dueAt",a.published_at AS "publishedAt",
                   a.lesson_id AS "lessonId",l.title AS "lessonTitle",f.file_name AS "fileName",a.max_points AS "maxPoints",
                   CASE WHEN ? THEN (SELECT COUNT(*) FROM assignment_submission s WHERE s.assignment_id=a.id) ELSE 0 END AS "submissionCount"
            FROM course_assignment a JOIN course_asset f ON f.id=a.asset_id
            LEFT JOIN lesson l ON l.id=a.lesson_id
            WHERE a.course_id=? ORDER BY a.published_at DESC,a.id
            """, canPublish, courseId);
        var lessons = db.list("""
            SELECT l.id,l.title FROM lesson l JOIN topic t ON t.id=l.topic_id
            WHERE t.course_id=? ORDER BY t.position,l.position,l.id
            """, courseId);
        return Map.of("courseTitle", course.get("title"), "canPublish", canPublish,
            "assignments", assignments, "lessons", lessons);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional(rollbackFor = Exception.class)
    public Object publish(@PathVariable long courseId, @Valid @RequestPart("assignment") AssignmentInput input,
                          @RequestPart("file") MultipartFile file, @AuthenticationPrincipal AuthService.User user) throws Exception {
        catalog.owner(courseId, user);
        Db.require(input.lessonId() == null || db.exists("""
            SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?
            """, input.lessonId(), courseId), BAD_REQUEST, "Choose a lesson from this course");
        String assetId = stageWorksheet(file, user);
        String id = Db.id();
        db.update("""
            INSERT INTO course_assignment(id,course_id,lesson_id,kind,title,instructions,due_at,published_at,asset_id,max_points)
            VALUES(?,?,?,?,?,?,?,?,?,?)
            """, id, courseId, input.lessonId(), input.kind(), input.title().trim(), input.instructions().trim(),
            input.dueAt(), System.currentTimeMillis(), assetId, input.maxPoints());
        return Map.of("id", id);
    }

    String stageWorksheet(MultipartFile file, AuthService.User user) throws Exception {
        String type = file.getContentType();
        Db.require(type != null && Set.of("application/pdf", "image/png", "image/jpeg").contains(type)
            && file.getSize() <= ("application/pdf".equals(type) ? 20 : 5) * 1024L * 1024,
            BAD_REQUEST, "Choose a PDF up to 20 MB or a PNG/JPG up to 5 MB");
        String assetId = (String) content.stageFile(file, user).get("id");
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_ROLLED_BACK) return;
                try { content.discardAssetFile(assetId); }
                catch (java.io.IOException e) { LOG.log(System.Logger.Level.WARNING, "Unable to remove rolled-back assignment asset", e); }
            }
        });
        return assetId;
    }

    @GetMapping("/{id}/worksheet")
    public ResponseEntity<Resource> download(@PathVariable long courseId, @PathVariable String id,
                                             @AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId, user);
        var worksheet = db.one("""
            SELECT f.id,f.file_name,f.content_type FROM course_assignment a
            JOIN course_asset f ON f.id=a.asset_id WHERE a.course_id=? AND a.id=?
            """, courseId, id);
        return content.asset((String) worksheet.get("id"), (String) worksheet.get("file_name"), (String) worksheet.get("content_type"));
    }
}
