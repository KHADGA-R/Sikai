package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
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

@RestController
@RequestMapping("/api/courses/{courseId}/assignments")
public class AssignmentController {
    public record AssignmentInput(@NotBlank @Size(max=160) String title, @NotNull @Size(max=4000) String instructions,
                                  @NotNull @Pattern(regexp="homework|classwork") String kind,
                                  @Positive Long lessonId, @Positive Long dueAt) {}

    private static final System.Logger LOG = System.getLogger(AssignmentController.class.getName());
    private final Db db;
    private final CatalogService catalog;
    private final ContentController content;

    public AssignmentController(Db db, CatalogService catalog, ContentController content) {
        this.db = db;
        this.catalog = catalog;
        this.content = content;
    }

    @GetMapping
    public Object list(@PathVariable long courseId, @AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId, user);
        var course = catalog.course(courseId, user);
        boolean canPublish = user.role().equals("admin") || user.role().equals("instructor") && user.id().equals(course.get("ownerId"));
        var assignments = db.list("""
            SELECT a.id,a.kind,a.title,a.instructions,a.due_at AS "dueAt",a.published_at AS "publishedAt",
                   a.lesson_id AS "lessonId",l.title AS "lessonTitle",f.file_name AS "fileName"
            FROM course_assignment a JOIN course_asset f ON f.id=a.asset_id
            LEFT JOIN lesson l ON l.id=a.lesson_id
            WHERE a.course_id=? ORDER BY a.published_at DESC,a.id
            """, courseId);
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
        String type = file.getContentType();
        Db.require(type != null && Set.of("application/pdf", "image/png", "image/jpeg").contains(type)
            && file.getSize() <= ("application/pdf".equals(type) ? 20 : 5) * 1024L * 1024,
            BAD_REQUEST, "Choose a PDF up to 20 MB or a PNG/JPG up to 5 MB");
        String assetId = (String) content.stage(file, user).get("id");
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_ROLLED_BACK) return;
                try { content.discardAssetFile(assetId); }
                catch (java.io.IOException e) { LOG.log(System.Logger.Level.WARNING, "Unable to remove rolled-back assignment asset", e); }
            }
        });
        String id = Db.id();
        db.update("""
            INSERT INTO course_assignment(id,course_id,lesson_id,kind,title,instructions,due_at,published_at,asset_id)
            VALUES(?,?,?,?,?,?,?,?,?)
            """, id, courseId, input.lessonId(), input.kind(), input.title().trim(), input.instructions().trim(),
            input.dueAt(), System.currentTimeMillis(), assetId);
        return Map.of("id", id);
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
