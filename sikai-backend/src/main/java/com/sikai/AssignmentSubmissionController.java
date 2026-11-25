package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api")
public class AssignmentSubmissionController {
    private static final String SUBMISSIONS = "/courses/{courseId}/assignments/{id}/submissions";
    private final Db db;
    private final CatalogService catalog;
    private final AssignmentController assignments;
    private final ContentController content;
    private final ObjectMapper json;

    public AssignmentSubmissionController(Db db, CatalogService catalog, AssignmentController assignments,
                                          ContentController content, ObjectMapper json) {
        this.db = db;
        this.catalog = catalog;
        this.assignments = assignments;
        this.content = content;
        this.json = json;
    }

    @GetMapping("/my-assignments")
    public Object dashboard(@AuthenticationPrincipal AuthService.User user) {
        Db.require(user != null && user.role().equals("student"), FORBIDDEN, "Sign in as a student to view your assignments");
        return db.list("""
            SELECT a.id,a.kind,a.title,a.instructions,a.course_id AS "courseId",c.title AS "courseTitle",
                   a.due_at AS "dueAt",a.published_at AS "publishedAt",a.max_points AS "maxPoints",
                   a.lesson_id AS "lessonId",l.title AS "lessonTitle",f.file_name AS "fileName",
                   (w.assignment_id IS NOT NULL) AS "hasDraft",s.submitted_at AS "submittedAt",
                   s.score,s.feedback,sf.file_name AS "submissionFileName"
            FROM enrollment e JOIN course c ON c.id=e.course_id JOIN course_assignment a ON a.course_id=c.id
            JOIN course_asset f ON f.id=a.asset_id LEFT JOIN lesson l ON l.id=a.lesson_id
            LEFT JOIN assignment_workspace w ON w.assignment_id=a.id AND w.student_id=e.user_id
            LEFT JOIN assignment_submission s ON s.assignment_id=a.id AND s.student_id=e.user_id
            LEFT JOIN course_asset sf ON sf.id=s.asset_id
            WHERE e.user_id=? AND c.published=TRUE ORDER BY a.published_at DESC,a.id
            """, user.id());
    }

    public record Draft(@Positive long revision) {}
    public record Review(@Min(0) Integer score, @NotNull @Size(max=4000) String feedback) {}

    @PostMapping(path=SUBMISSIONS, consumes=MediaType.APPLICATION_JSON_VALUE)
    @Transactional
    public Object submitDraft(@PathVariable long courseId, @PathVariable String id, @Valid @RequestBody Draft draft,
                              @AuthenticationPrincipal AuthService.User user) throws Exception {
        startSubmission(courseId, id, user);
        var workspace = db.one("""
            SELECT annotations,revision FROM assignment_workspace WHERE assignment_id=? AND student_id=?
            """, id, user.id());
        Db.require(((Number) workspace.get("revision")).longValue() == draft.revision(),
            CONFLICT, "The draft changed. Reload it before submitting.");
        String annotations = (String) workspace.get("annotations");
        Db.require(!json.readTree(annotations).isEmpty(), BAD_REQUEST, "Add work to the whiteboard before submitting");
        return insert(id, user.id(), null, annotations);
    }

    @PostMapping(path=SUBMISSIONS, consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional(rollbackFor=Exception.class)
    public Object submitFile(@PathVariable long courseId, @PathVariable String id, @RequestPart("file") MultipartFile file,
                             @AuthenticationPrincipal AuthService.User user) throws Exception {
        startSubmission(courseId, id, user);
        return insert(id, user.id(), assignments.stageWorksheet(file, user), null);
    }

    @GetMapping(SUBMISSIONS)
    public Object roster(@PathVariable long courseId, @PathVariable String id, @AuthenticationPrincipal AuthService.User user) {
        catalog.owner(courseId, user);
        var assignment = assignment(courseId, id);
        var submissions = db.list("""
            SELECT u.id AS "studentId",u.name AS "studentName",s.submitted_at AS "submittedAt",
                   s.score,s.feedback,f.file_name AS "fileName"
            FROM assignment_submission s JOIN app_user u ON u.id=s.student_id LEFT JOIN course_asset f ON f.id=s.asset_id
            WHERE s.assignment_id=? ORDER BY s.submitted_at DESC,u.name
            """, id);
        return Map.of("assignment", assignment, "submissions", submissions);
    }

    @GetMapping(SUBMISSIONS + "/{studentId}/whiteboard")
    public Object submittedBoard(@PathVariable long courseId, @PathVariable String id, @PathVariable String studentId,
                                 @AuthenticationPrincipal AuthService.User user) throws Exception {
        var submission = submission(courseId, id, studentId, user);
        Db.require(submission.get("annotations") != null, NOT_FOUND, "This submission is an uploaded file");
        return Map.of("assignment", assignments.worksheetDetails(courseId, id), "revision", 0,
            "marks", json.readTree((String) submission.get("annotations")));
    }

    @GetMapping(SUBMISSIONS + "/{studentId}/file")
    public ResponseEntity<Resource> submittedFile(@PathVariable long courseId, @PathVariable String id,
                                                   @PathVariable String studentId, @AuthenticationPrincipal AuthService.User user) {
        var submission = submission(courseId, id, studentId, user);
        Db.require(submission.get("asset_id") != null, NOT_FOUND, "This submission is a whiteboard");
        return content.asset((String) submission.get("asset_id"), (String) submission.get("file_name"),
            (String) submission.get("content_type"));
    }

    @PutMapping(SUBMISSIONS + "/{studentId}/review")
    @Transactional
    public Object review(@PathVariable long courseId, @PathVariable String id, @PathVariable String studentId,
                         @Valid @RequestBody Review review, @AuthenticationPrincipal AuthService.User user) {
        catalog.owner(courseId, user);
        var assignment = assignment(courseId, id);
        Integer max = (Integer) assignment.get("maxPoints");
        Db.require(max == null ? review.score() == null : review.score() != null && review.score() <= max,
            BAD_REQUEST, "Enter a score within the assignment's point range");
        Db.require(db.update("UPDATE assignment_submission SET feedback=?,score=? WHERE assignment_id=? AND student_id=?",
            review.feedback().trim(), review.score(), id, studentId) == 1, NOT_FOUND, "Submission not found");
        return Map.of("saved", true);
    }

    private Map<String,Object> assignment(long courseId, String id) {
        return db.one("SELECT title,instructions,max_points AS \"maxPoints\" FROM course_assignment WHERE course_id=? AND id=?", courseId, id);
    }

    private void startSubmission(long courseId, String id, AuthService.User user) {
        assignments.requireStudent(courseId, user);
        db.one("SELECT id FROM course_assignment WHERE course_id=? AND id=? FOR UPDATE", courseId, id);
        Db.require(!db.exists("SELECT assignment_id FROM assignment_submission WHERE assignment_id=? AND student_id=?", id, user.id()),
            CONFLICT, "You have already submitted this assignment");
    }

    private Object insert(String assignmentId, String studentId, String assetId, String annotations) {
        long submittedAt = System.currentTimeMillis();
        db.update("INSERT INTO assignment_submission(assignment_id,student_id,asset_id,annotations,submitted_at) VALUES(?,?,?,?,?)",
            assignmentId, studentId, assetId, annotations, submittedAt);
        return Map.of("submittedAt", submittedAt);
    }

    private Map<String,Object> submission(long courseId, String id, String studentId, AuthService.User user) {
        if ("me".equals(studentId)) {
            assignments.requireStudent(courseId, user);
            studentId = user.id();
        } else {
            catalog.owner(courseId, user);
        }
        return db.one("""
            SELECT s.annotations,s.asset_id,f.file_name,f.content_type FROM assignment_submission s
            JOIN course_assignment a ON a.id=s.assignment_id LEFT JOIN course_asset f ON f.id=s.asset_id
            WHERE a.course_id=? AND s.assignment_id=? AND s.student_id=?
            """, courseId, id, studentId);
    }
}
