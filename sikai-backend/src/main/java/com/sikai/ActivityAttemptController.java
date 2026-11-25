package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api")
public class ActivityAttemptController {
    private static final String COURSE = "/courses/{courseId}/assignments/{assignmentId}/activity/attempt";
    private static final String LIVE = "/live-classes/slots/{slotId}/activities";
    private final Db db;
    private final ObjectMapper json;
    private final WhiteboardService boards;
    private final AssignmentController assignments;

    public ActivityAttemptController(Db db, ObjectMapper json, WhiteboardService boards, AssignmentController assignments) {
        this.db = db;
        this.json = json;
        this.boards = boards;
        this.assignments = assignments;
    }

    public record Placement(@Positive int cardId, @Positive int targetId) {}
    public record Attempt(@PositiveOrZero long revision,
                          @NotNull @Size(max=30) List<@NotNull @Valid Placement> placements,
                          boolean check, boolean finish) {}
    public record Launch(@NotBlank @Size(max=36) String assignmentId, @Min(1) @Max(120) Integer durationMinutes) {}
    public record Close(boolean reveal) {}
    public record ShareSummary(boolean shared) {}
    private record Scope(String id, String assignmentId, Map<String,Object> assignment, boolean closed) {}
    private record CardReview(int cardId, String cardLabel, String placedTarget, String expectedTarget, boolean correct) {}
    private record MissedTarget(String label, int count) {}
    private record ClassSummary(int submitted, int allCorrect, List<MissedTarget> mostMissed) {}
    private record RoundResults(List<Map<String,Object>> progress, ClassSummary summary) {}

    @GetMapping(COURSE)
    public Object courseAttempt(@PathVariable long courseId, @PathVariable String assignmentId,
                                @AuthenticationPrincipal AuthService.User user) throws Exception {
        assignments.requireStudent(courseId, user);
        var scope = courseScope(courseId, assignmentId, false);
        return attempt(scope.id(), user.id());
    }

    @PutMapping(COURSE)
    @Transactional
    public Object saveCourse(@PathVariable long courseId, @PathVariable String assignmentId, @Valid @RequestBody Attempt input,
                             @AuthenticationPrincipal AuthService.User user) throws Exception {
        assignments.requireStudent(courseId, user);
        return write(courseScope(courseId, assignmentId, true), user.id(), input);
    }

    @GetMapping(LIVE)
    public Object classroom(@PathVariable String slotId, @AuthenticationPrincipal AuthService.User user) throws Exception {
        boolean teacher = user.id().equals(boards.access(slotId, user).get("owner_id"));
        var rows = db.list("""
            SELECT r.id,r.assignment_id,r.started_at,r.ended_at,r.deadline_at,r.revealed,r.summary_shared,
                   a.title,a.instructions,a.activity_definition,a.max_points
            FROM live_activity_run r JOIN course_assignment a ON a.id=r.assignment_id
            WHERE r.slot_id=? ORDER BY r.started_at DESC,r.id DESC LIMIT 1
            """, slotId);
        if (rows.isEmpty()) return Map.of("active", false);
        var row = rows.get(0);
        String runId = (String) row.get("id");
        var definition = definition(row);
        var result = new HashMap<String,Object>();
        result.put("active", true);
        result.put("runId", runId);
        result.put("assignmentId", row.get("assignment_id"));
        result.put("round", db.one("""
            SELECT COUNT(*) AS total FROM live_activity_run WHERE slot_id=? AND assignment_id=?
            """, slotId, row.get("assignment_id")).get("total"));
        long now = System.currentTimeMillis();
        result.put("closed", closed(row, now));
        result.put("expired", row.get("ended_at") == null
            && row.get("deadline_at") instanceof Number deadline && deadline.longValue() <= now);
        if (row.get("deadline_at") instanceof Number deadline) {
            result.put("remainingMillis", Math.max(0, deadline.longValue() - now));
        }
        result.put("activity", AssignmentActivityController.playable(row, definition));
        if (Boolean.TRUE.equals(row.get("revealed"))) {
            result.put("solution", definition.cards().stream().map(card -> new Placement(card.id(), card.targetId())).toList());
        }
        boolean summaryShared = Boolean.TRUE.equals(row.get("summary_shared"));
        if (teacher || summaryShared) {
            var results = roundResults(slotId, runId, ((Number) row.get("started_at")).longValue(), definition);
            result.put("summary", results.summary());
            result.put("summaryShared", summaryShared);
            if (teacher) result.put("progress", results.progress());
        }
        if (!teacher && row.get("max_points") != null) {
            var feedback = db.list("""
                SELECT s.score,s.feedback,a.max_points AS "maxPoints" FROM assignment_submission s
                JOIN course_assignment a ON a.id=s.assignment_id
                WHERE s.assignment_id=? AND s.student_id=? AND s.score IS NOT NULL
                """, row.get("assignment_id"), user.id());
            if (!feedback.isEmpty()) result.put("grade", feedback.get(0));
        }
        return result;
    }

    @PatchMapping(LIVE + "/{runId}/summary")
    @Transactional
    public void shareSummary(@PathVariable String slotId, @PathVariable String runId, @RequestBody ShareSummary input,
                             @AuthenticationPrincipal AuthService.User user) {
        requireTeacher(slotId, user);
        var run = db.one("SELECT ended_at,deadline_at FROM live_activity_run WHERE id=? AND slot_id=? FOR UPDATE", runId, slotId);
        Db.require(!input.shared() || closed(run, System.currentTimeMillis()), CONFLICT,
            "Close the activity before sharing its summary");
        db.update("UPDATE live_activity_run SET summary_shared=? WHERE id=? AND slot_id=?", input.shared(), runId, slotId);
    }

    @GetMapping(LIVE + "/library")
    public Object library(@PathVariable String slotId, @AuthenticationPrincipal AuthService.User user) {
        requireTeacher(slotId, user);
        return db.list("""
            SELECT a.id,a.title,c.title AS "courseTitle" FROM course_assignment a JOIN course c ON c.id=a.course_id
            WHERE c.owner_id=? AND c.published=TRUE AND a.activity_definition IS NOT NULL
            ORDER BY a.published_at DESC,a.id
            """, user.id());
    }

    @PostMapping(LIVE)
    @Transactional
    public Object launch(@PathVariable String slotId, @Valid @RequestBody Launch input,
                         @AuthenticationPrincipal AuthService.User user) {
        requireTeacher(slotId, user);
        db.one("SELECT id FROM live_slot WHERE id=? FOR UPDATE", slotId);
        db.one("""
            SELECT a.id FROM course_assignment a JOIN course c ON c.id=a.course_id
            WHERE a.id=? AND c.owner_id=? AND c.published=TRUE AND a.activity_definition IS NOT NULL
            """, input.assignmentId(), user.id());
        long now = System.currentTimeMillis();
        var latest = db.one("SELECT MAX(started_at) AS latest FROM live_activity_run WHERE slot_id=?", slotId).get("latest");
        long startedAt = latest instanceof Number previous ? Math.max(now, previous.longValue() + 1) : now;
        db.update("UPDATE live_activity_run SET ended_at=? WHERE slot_id=? AND ended_at IS NULL", now, slotId);
        String id = Db.id();
        Long deadline = input.durationMinutes() == null ? null : now + input.durationMinutes() * 60_000L;
        db.update("INSERT INTO live_activity_run(id,slot_id,assignment_id,started_at,deadline_at) VALUES(?,?,?,?,?)",
            id, slotId, input.assignmentId(), startedAt, deadline);
        return Map.of("runId", id);
    }

    @GetMapping(LIVE + "/library/{assignmentId}")
    public Object preview(@PathVariable String slotId, @PathVariable String assignmentId,
                          @AuthenticationPrincipal AuthService.User user) throws Exception {
        requireTeacher(slotId, user);
        var row = db.one("""
            SELECT a.title,a.instructions,a.activity_definition,a.max_points FROM course_assignment a JOIN course c ON c.id=a.course_id
            WHERE a.id=? AND c.owner_id=? AND c.published=TRUE AND a.activity_definition IS NOT NULL
            """, assignmentId, user.id());
        return AssignmentActivityController.playable(row, definition(row));
    }

    @PatchMapping(LIVE + "/{runId}")
    @Transactional
    public void close(@PathVariable String slotId, @PathVariable String runId, @RequestBody Close input,
                      @AuthenticationPrincipal AuthService.User user) {
        requireTeacher(slotId, user);
        Db.require(db.update("""
            UPDATE live_activity_run SET ended_at=COALESCE(ended_at,?),revealed=(revealed OR ?) WHERE id=? AND slot_id=?
            """, System.currentTimeMillis(), input.reveal(), runId, slotId) == 1, NOT_FOUND, "Activity not found");
    }

    @GetMapping(LIVE + "/{runId}/attempt")
    public Object liveAttempt(@PathVariable String slotId, @PathVariable String runId,
                              @AuthenticationPrincipal AuthService.User user) throws Exception {
        requireParticipant(slotId, user);
        var scope = liveScope(slotId, runId, false);
        var current = new HashMap<>(attempt(runId, user.id()));
        current.put("alreadySubmitted", scope.assignment().get("max_points") != null && hasSubmission(scope.assignmentId(), user.id()));
        return current;
    }

    @PutMapping(LIVE + "/{runId}/attempt")
    @Transactional
    public Object saveLive(@PathVariable String slotId, @PathVariable String runId, @Valid @RequestBody Attempt input,
                           @AuthenticationPrincipal AuthService.User user) throws Exception {
        requireParticipant(slotId, user);
        return write(liveScope(slotId, runId, true), user.id(), input);
    }

    @GetMapping(LIVE + "/{runId}/students/{studentId}")
    public Object inspect(@PathVariable String slotId, @PathVariable String runId, @PathVariable String studentId,
                          @AuthenticationPrincipal AuthService.User user) throws Exception {
        requireTeacher(slotId, user);
        var scope = liveScope(slotId, runId, false);
        Db.require(db.exists("SELECT id FROM booking WHERE slot_id=? AND student_id=? AND status='confirmed'",
            slotId, studentId), NOT_FOUND, "Student not found");
        var work = new HashMap<>(attempt(runId, studentId));
        if (Boolean.TRUE.equals(work.get("finished"))) {
            List<Placement> placements = json.convertValue(work.get("placements"), new TypeReference<>() {});
            work.put("review", review(definition(scope.assignment()), placements));
        }
        return work;
    }

    private Scope courseScope(long courseId, String id, boolean lock) {
        var row = db.one("""
            SELECT id,activity_definition,max_points FROM course_assignment WHERE course_id=? AND id=? AND activity_definition IS NOT NULL
            """ + (lock ? " FOR UPDATE" : ""), courseId, id);
        return new Scope(id, id, row, false);
    }

    private Scope liveScope(String slotId, String runId, boolean lock) {
        var run = db.one("SELECT assignment_id,ended_at,deadline_at FROM live_activity_run WHERE slot_id=? AND id=?" +
            (lock ? " FOR UPDATE" : ""), slotId, runId);
        String assignmentId = (String) run.get("assignment_id");
        var row = db.one("SELECT activity_definition,max_points FROM course_assignment WHERE id=?", assignmentId);
        return new Scope(runId, assignmentId, row, closed(run, System.currentTimeMillis()));
    }

    private boolean closed(Map<String,Object> run, long now) {
        return run.get("ended_at") != null
            || run.get("deadline_at") instanceof Number deadline && deadline.longValue() <= now;
    }

    private Map<String,Object> attempt(String scope, String student) throws Exception {
        var rows = db.list("""
            SELECT placements,revision,finished_at FROM activity_attempt WHERE scope_id=? AND student_id=?
            """, scope, student);
        if (rows.isEmpty()) return Map.of("placements", List.of(), "revision", 0, "finished", false);
        var row = rows.get(0);
        List<Placement> placements = json.readValue((String) row.get("placements"), new TypeReference<>() {});
        return Map.of("placements", placements, "revision", row.get("revision"), "finished", row.get("finished_at") != null);
    }

    private RoundResults roundResults(String slotId, String runId, long startedAt,
                                      AssignmentActivityController.Definition definition) throws Exception {
        var rows = db.list("""
            SELECT u.id AS "studentId",u.name AS "studentName",t.placements,t.finished_at
            FROM app_user u LEFT JOIN activity_attempt t ON t.scope_id=? AND t.student_id=u.id
            WHERE EXISTS (SELECT 1 FROM booking b WHERE b.student_id=u.id AND b.slot_id=? AND b.status='confirmed')
            ORDER BY u.name,u.id
            """, runId, slotId);
        var progress = new ArrayList<Map<String,Object>>();
        var finished = new ArrayList<Map<String,Object>>();
        var missed = new HashMap<String,Integer>();
        int allCorrect = 0;
        for (var row : rows) {
            var student = new HashMap<String,Object>();
            student.put("studentId", row.get("studentId"));
            student.put("studentName", row.get("studentName"));
            if (row.get("finished_at") instanceof Number time) {
                List<Placement> placements = json.readValue((String) row.get("placements"), new TypeReference<>() {});
                var cards = review(definition, placements);
                int correct = 0;
                for (var card : cards) {
                    if (card.correct()) correct++;
                    else missed.merge(card.expectedTarget(), 1, Integer::sum);
                }
                if (correct == cards.size()) allCorrect++;
                student.put("state", "finished");
                student.put("correct", correct);
                student.put("total", cards.size());
                student.put("elapsedMillis", Math.max(0, time.longValue() - startedAt));
                finished.add(student);
            } else {
                student.put("state", row.get("placements") == null ? "waiting" : "working");
            }
            progress.add(student);
        }
        finished.sort(Comparator.<Map<String,Object>>comparingInt(student -> (Integer) student.get("correct")).reversed()
            .thenComparingLong(student -> (Long) student.get("elapsedMillis")));
        int rank = 0;
        Map<String,Object> previous = null;
        for (int index = 0; index < finished.size(); index++) {
            var student = finished.get(index);
            if (previous == null || !previous.get("correct").equals(student.get("correct"))
                || !previous.get("elapsedMillis").equals(student.get("elapsedMillis"))) rank = index + 1;
            student.put("rank", rank);
            previous = student;
        }
        var top = missed.entrySet().stream().map(entry -> new MissedTarget(entry.getKey(), entry.getValue()))
            .sorted(Comparator.comparingInt(MissedTarget::count).reversed().thenComparing(MissedTarget::label)).limit(3).toList();
        return new RoundResults(progress, new ClassSummary(finished.size(), allCorrect, top));
    }

    private List<CardReview> review(AssignmentActivityController.Definition definition, List<Placement> placements) {
        var labels = new HashMap<Integer,String>();
        definition.targets().forEach(target -> labels.put(target.id(), target.label()));
        var placed = new HashMap<Integer,Integer>();
        placements.forEach(placement -> placed.put(placement.cardId(), placement.targetId()));
        return definition.cards().stream().map(card -> {
            var target = placed.get(card.id());
            return new CardReview(card.id(), card.label(), labels.get(target), labels.get(card.targetId()),
                Objects.equals(target, card.targetId()));
        }).toList();
    }

    private Object write(Scope scope, String student, Attempt input) throws Exception {
        Db.require(!scope.closed(), CONFLICT, "The teacher closed this activity");
        boolean graded = scope.assignment().get("max_points") != null;
        Db.require(!graded || !input.check(), BAD_REQUEST, "Answer checking is available for practice activities");
        var previous = attempt(scope.id(), student);
        long revision = ((Number) previous.get("revision")).longValue();
        Db.require(revision == input.revision() && !Boolean.TRUE.equals(previous.get("finished")), CONFLICT,
            "Your activity changed or was already finished. Reopen it to view the saved work.");
        var definition = definition(scope.assignment());
        var validTargets = new HashSet<Integer>();
        definition.targets().forEach(target -> validTargets.add(target.id()));
        var key = new HashMap<Integer,Integer>();
        definition.cards().forEach(card -> key.put(card.id(), card.targetId()));
        var cards = new HashSet<Integer>();
        var occupied = new HashSet<Integer>();
        var wrong = new ArrayList<Integer>();
        for (var placement : input.placements()) {
            Db.require(cards.add(placement.cardId()) && key.containsKey(placement.cardId()) && validTargets.contains(placement.targetId())
                && (definition.mode().equals("sort") || occupied.add(placement.targetId())), BAD_REQUEST, "Invalid card placement");
            if (key.get(placement.cardId()) != placement.targetId()) wrong.add(placement.cardId());
        }
        Db.require(!input.finish() || cards.size() == key.size(), BAD_REQUEST, "Place every card before finishing");
        String placements = json.writeValueAsString(input.placements());
        Long finished = input.finish() ? System.currentTimeMillis() : null;
        if (graded && finished != null) {
            db.one("SELECT id FROM course_assignment WHERE id=? FOR UPDATE", scope.assignmentId());
            boolean submitted = hasSubmission(scope.assignmentId(), student);
            Db.require(!submitted || !scope.id().equals(scope.assignmentId()), CONFLICT, "You already submitted this graded activity");
            if (!submitted) {
                db.update("INSERT INTO assignment_submission(assignment_id,student_id,submitted_at,annotations) VALUES(?,?,?,?)",
                    scope.assignmentId(), student, finished, placements);
            }
        }
        if (revision == 0) {
            db.update("""
                INSERT INTO activity_attempt(assignment_id,scope_id,live_run_id,student_id,placements,finished_at)
                VALUES(?,?,?,?,?,?)
                """, scope.assignmentId(), scope.id(), scope.id().equals(scope.assignmentId()) ? null : scope.id(),
                student, placements, finished);
        } else {
            db.update("UPDATE activity_attempt SET placements=?,finished_at=?,revision=? WHERE scope_id=? AND student_id=?",
                placements, finished, revision + 1, scope.id(), student);
        }
        return Map.of("revision", revision + 1, "finished", input.finish(),
            "incorrect", input.check() ? wrong : List.of());
    }

    private boolean hasSubmission(String assignmentId, String studentId) {
        return db.exists("SELECT assignment_id FROM assignment_submission WHERE assignment_id=? AND student_id=?", assignmentId, studentId);
    }

    private AssignmentActivityController.Definition definition(Map<String,Object> row) throws Exception {
        return json.readValue((String) row.get("activity_definition"), AssignmentActivityController.Definition.class);
    }

    private void requireTeacher(String slotId, AuthService.User user) {
        Db.require(user.id().equals(boards.access(slotId, user).get("owner_id")), FORBIDDEN, "Only the class teacher can manage activities");
    }

    private void requireParticipant(String slotId, AuthService.User user) {
        boards.access(slotId, user);
        Db.require(db.exists("SELECT id FROM booking WHERE slot_id=? AND student_id=? AND status='confirmed'",
            slotId, user.id()), FORBIDDEN, "Only confirmed students can work on this activity");
    }
}
