package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
public class WhiteboardService {
    private static final String BLANK = "blank";
    private static final Pattern SLIDE_IMAGE = Pattern.compile("data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}");
    private final Db db;
    private final ObjectMapper json;
    private record PreviewKey(String slotId, String userId) {}
    private record ActivePreview(String slideId, WhiteboardController.FlowPreview preview, long expiresAt) {}
    private record ActiveCalculator(WhiteboardController.CalculatorPreview preview, long expiresAt) {}
    public record ClassroomPreviews(List<WhiteboardController.FlowPreview> flows, WhiteboardController.CalculatorPreview calculator) {}
    private final Map<PreviewKey, ActivePreview> previews = new ConcurrentHashMap<>();
    private final Map<String, ActiveCalculator> calculators = new ConcurrentHashMap<>();

    public WhiteboardService(Db db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    public Object state(String slotId, String slideId, long revision, AuthService.User user) {
        var slot = access(slotId, user);
        long current = ((Number) slot.get("board_revision")).longValue();
        if (current == revision) return Map.of("revision", current, "unchanged", true);
        requireSlide(slotId, slideId);
        var slides = db.list("SELECT id,title,image_data<>'' AS \"hasImage\" FROM live_board_slide WHERE slot_id=? ORDER BY position", slotId);
        var marks = db.list("""
            SELECT m.id,m.author_id AS "authorId",u.name AS "authorName",m.tool,m.color,m.points,m.label,
                   m.stroke_style AS "strokeStyle",m.stroke_width AS "strokeWidth"
            FROM live_board_mark m JOIN app_user u ON u.id=m.author_id
            WHERE m.slot_id=? AND m.slide_id=? ORDER BY m.revision
            """, slotId, slideId);
        var erasures = db.list("""
            SELECT e.mark_id AS "markId", e.gesture_id AS "gestureId", e.points, e.radius
            FROM live_board_erase e JOIN live_board_mark m ON m.id=e.mark_id
            WHERE m.slot_id=? AND m.slide_id=?
            """, slotId, slideId);
        var notes = db.list("""
            SELECT n.id,n.author_id AS "authorId",u.name AS "authorName",n.color,n.kind,n.note_text AS "text",
                   n.left_pos AS x,n.top_pos AS y,n.note_width AS width,n.note_height AS height
            FROM live_board_note n JOIN app_user u ON u.id=n.author_id
            WHERE n.slot_id=? AND n.slide_id=? ORDER BY n.revision
            """, slotId, slideId);
        return Map.ofEntries(Map.entry("revision", current), Map.entry("subject", slot.get("subject")),
            Map.entry("instructor", user.id().equals(slot.get("owner_id"))), Map.entry("instructorId", slot.get("owner_id")),
            Map.entry("meetingUrl", slot.get("meeting_url")), Map.entry("start", slot.get("start_at")),
            Map.entry("end", slot.get("end_at")), Map.entry("sikaiVideo", slot.get("sikai_video")),
            Map.entry("supportsLearningObjects", true),
            Map.entry("supportsHistogram", true),
            Map.entry("supportsFlowPreviews", true),
            Map.entry("supportsCalculatorPreviews", true),
            Map.entry("supportsActivityWidgets", true),
            Map.entry("supportsMathWidgets", true),
            Map.entry("slides", slides), Map.entry("marks", marks), Map.entry("erasures", erasures), Map.entry("notes", notes));
    }

    public Object image(String slotId, String slideId, AuthService.User user) {
        access(slotId, user);
        return Map.of("image", db.one("SELECT image_data FROM live_board_slide WHERE slot_id=? AND id=?", slotId, slideId).get("image_data"));
    }

    @Transactional public Object addSlide(String slotId, WhiteboardController.SlideInput input, AuthService.User user) {
        var slot = access(slotId, user);
        Db.require(user.id().equals(slot.get("owner_id")), FORBIDDEN, "Only the instructor can add slides");
        Db.require(input.image().isEmpty() || SLIDE_IMAGE.matcher(input.image()).matches(), BAD_REQUEST, "Use a PNG, JPEG or WebP image");
        nextRevision(slotId);
        int count = ((Number) db.one("SELECT COUNT(*) AS total FROM live_board_slide WHERE slot_id=?", slotId).get("total")).intValue();
        Db.require(count < 12, CONFLICT, "This classroom already has 12 slides");
        String id = Db.id();
        db.update("INSERT INTO live_board_slide(id,slot_id,position,title,image_data) VALUES (?,?,?,?,?)",
            id, slotId, count + 1, input.title().trim(), input.image());
        return Map.of("id", id);
    }

    @Transactional public Object addMark(String slotId, WhiteboardController.MarkInput input, AuthService.User user) {
        access(slotId, user);
        requireSlide(slotId, input.slideId());
        boolean validMark = switch (input.tool()) {
            case "text" -> input.points().size() == 1 && !input.label().isBlank();
            case "pen", "highlighter" -> input.label().isEmpty();
            default -> input.points().size() == 2 && input.label().isEmpty();
        };
        Db.require(validMark, BAD_REQUEST, "Provide a text position, stroke, or two shape corners");
        long revision = nextRevision(slotId);
        int count = ((Number) db.one("SELECT COUNT(*) AS total FROM live_board_mark WHERE slot_id=? AND slide_id=?", slotId, input.slideId()).get("total")).intValue();
        Db.require(count < 500, CONFLICT, "This slide is full. Use another slide or remove a mark.");
        String id = Db.id();
        String style = input.strokeStyle() == null ? "solid" : input.strokeStyle();
        int width = input.strokeWidth() == null ? ("highlighter".equals(input.tool()) ? 20 : 4) : input.strokeWidth();
        db.update("""
            INSERT INTO live_board_mark(id,slot_id,slide_id,author_id,tool,color,points,label,revision,stroke_style,stroke_width)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, id, slotId, input.slideId(), user.id(), input.tool(), input.color(),
            json.valueToTree(input.points()).toString(), input.label().trim(), revision, style, width);
        return Map.of("id", id);
    }

    @Transactional public void deleteMark(String slotId, String markId, AuthService.User user) {
        access(slotId, user);
        nextRevision(slotId);
        Db.require(db.update("DELETE FROM live_board_mark WHERE slot_id=? AND id=? AND author_id=?", slotId, markId, user.id()) == 1,
            NOT_FOUND, "Your mark was not found");
    }

    @Transactional public void erase(String slotId, WhiteboardController.EraseInput input, AuthService.User user) {
        access(slotId, user);
        requireSlide(slotId, input.slideId());
        nextRevision(slotId);
        var targets = new HashSet<>(input.markIds());
        String gestureId = Db.id();
        String points = json.valueToTree(input.points()).toString();
        int radius = input.radius() == null ? 15 : input.radius();
        var marks = db.list("SELECT id FROM live_board_mark WHERE slot_id=? AND slide_id=? AND author_id=?",
            slotId, input.slideId(), user.id());
        for (var mark : marks) {
            String id = (String) mark.get("id");
            if (targets.contains(id)) {
                db.update("INSERT INTO live_board_erase(mark_id,gesture_id,points,radius) VALUES (?,?,?,?)",
                    id, gestureId, points, radius);
            }
        }
    }

    @Transactional public Object addNote(String slotId, WhiteboardController.NoteInput input, AuthService.User user) {
        access(slotId, user);
        requireSlide(slotId, input.slideId());
        long revision = nextRevision(slotId);
        int count = ((Number) db.one("SELECT COUNT(*) AS total FROM live_board_note WHERE slot_id=? AND slide_id=?",
            slotId, input.slideId()).get("total")).intValue();
        Db.require(count < 50, CONFLICT, "This slide already has 50 whiteboard objects");
        int offset = 60 + (count % 8) * 25;
        String id = Db.id();
        String kind = input.kind() == null ? "sticky" : input.kind();
        boolean sticky = kind.equals("sticky");
        Db.require(!input.histogram() || kind.equals("graph"), BAD_REQUEST, "A histogram must use the graph tool");
        Db.require(input.widget() == null || kind.equals("graph") && !input.histogram(), BAD_REQUEST, "Invalid whiteboard widget");
        String content = input.widget() != null ? "{\"widget\":\"" + input.widget() + "\"}"
            : input.histogram() ? "{\"histogram\":true}" : "";
        db.update("""
            INSERT INTO live_board_note(id,slot_id,slide_id,author_id,color,kind,note_text,left_pos,top_pos,note_width,note_height,revision)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, id, slotId, input.slideId(), user.id(), input.color(), kind, content, offset, offset,
            sticky ? 250 : 560, sticky ? 275 : "coordinate-grid".equals(input.widget()) ? 620 : 390, revision);
        return Map.of("id", id);
    }

    @Transactional public void updateNote(String slotId, String noteId, WhiteboardController.NoteUpdate input, AuthService.User user) {
        access(slotId, user);
        nextRevision(slotId);
        var bounds = input.bounds();
        Db.require(input.text() != null || bounds != null, BAD_REQUEST, "Enter a note change");
        Db.require(bounds == null || bounds.x() + bounds.width() <= 1000 && bounds.y() + bounds.height() <= 1000,
            BAD_REQUEST, "Keep the note inside the whiteboard");
        int updated = db.update("""
            UPDATE live_board_note SET note_text=COALESCE(?,note_text),left_pos=COALESCE(?,left_pos),
                top_pos=COALESCE(?,top_pos),note_width=COALESCE(?,note_width),note_height=COALESCE(?,note_height)
            WHERE slot_id=? AND id=? AND author_id=?
            """, input.text(), bounds == null ? null : bounds.x(), bounds == null ? null : bounds.y(),
            bounds == null ? null : bounds.width(), bounds == null ? null : bounds.height(), slotId, noteId, user.id());
        Db.require(updated == 1, NOT_FOUND, "Your sticky note was not found");
    }

    @Transactional public void deleteNote(String slotId, String noteId, AuthService.User user) {
        access(slotId, user);
        nextRevision(slotId);
        Db.require(db.update("DELETE FROM live_board_note WHERE slot_id=? AND id=? AND author_id=?", slotId, noteId, user.id()) == 1,
            NOT_FOUND, "Your sticky note was not found");
    }

    private Map<String,Object> access(String slotId, AuthService.User user) {
        var slot = db.one("""
            SELECT s.board_revision,s.closed,s.meeting_url,s.start_at,s.end_at,s.sikai_video,t.owner_id,t.subject FROM live_slot s
            JOIN teacher t ON t.id=s.teacher_id WHERE s.id=?
            """, slotId);
        Db.require(!Boolean.TRUE.equals(slot.get("closed")) && (user.id().equals(slot.get("owner_id"))
            || db.exists("SELECT id FROM booking WHERE slot_id=? AND student_id=? AND status='confirmed'", slotId, user.id())),
            FORBIDDEN, "This whiteboard is available to the instructor and confirmed students");
        return slot;
    }

    public ClassroomPreviews classroomPreviews(String slotId, WhiteboardController.FlowPulse input, AuthService.User user,
                                               boolean includeCalculator) {
        var slot = access(slotId, user);
        var key = new PreviewKey(slotId, user.id());
        var preview = input.preview();
        long now = System.currentTimeMillis();
        previews.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
        if (preview == null) {
            previews.remove(key);
        } else if (db.exists("SELECT id FROM live_board_note WHERE id=? AND slot_id=? AND slide_id=? AND author_id=? AND kind='flowchart'",
                preview.noteId(), slotId, input.slideId(), user.id())) {
            previews.put(key, new ActivePreview(input.slideId(), preview, now + 2500));
        } else {
            previews.remove(key);
        }
        var flows = previews.entrySet().stream()
            .filter(entry -> entry.getKey().slotId().equals(slotId) && !entry.getKey().equals(key)
                && entry.getValue().slideId().equals(input.slideId()))
            .map(entry -> entry.getValue().preview()).toList();
        if (!includeCalculator) return new ClassroomPreviews(flows, null);
        calculators.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
        if (user.id().equals(slot.get("owner_id"))) {
            if (input.calculator() == null) calculators.remove(slotId);
            else calculators.put(slotId, new ActiveCalculator(input.calculator(), now + 2500));
            return new ClassroomPreviews(flows, null);
        }
        var calculator = calculators.get(slotId);
        return new ClassroomPreviews(flows, calculator == null ? null : calculator.preview());
    }

    private void requireSlide(String slotId, String slideId) {
        Db.require(BLANK.equals(slideId) || db.exists("SELECT id FROM live_board_slide WHERE slot_id=? AND id=?", slotId, slideId),
            NOT_FOUND, "Slide not found");
    }

    private long nextRevision(String slotId) {
        db.update("UPDATE live_slot SET board_revision=board_revision+1 WHERE id=?", slotId);
        return ((Number) db.one("SELECT board_revision FROM live_slot WHERE id=?", slotId).get("board_revision")).longValue();
    }
}
