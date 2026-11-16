package com.sikai;

import jakarta.validation.constraints.*;
import java.net.URI;
import java.time.ZoneId;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

/** Scheduling transactions lock one database row so conflict checks and writes are atomic. */
@Service
public class LiveService {
    /** Public teaching metadata; ownership and the teacher name are derived from the principal. */
    public record TeacherInput(@NotBlank String subject,@NotBlank @Size(max=1000) String bio,@NotBlank @Size(max=120) String languages,@Size(max=300000) String photoUrl) {}
    /** Start is epoch milliseconds; duration is one of the supported minute values. */
    public record SlotInput(long start,int minutes,@NotNull @Size(max=2048) String meetingUrl) {}
    /** Optional replacing identifies a booking to reschedule atomically; timezone is an IANA zone ID. */
    public record BookInput(@NotBlank String slotId,@NotNull @Size(max=1000) String goals,@NotBlank @Size(max=100) String timezone,String replacing) {}
    static final String TEACHERS="SELECT t.id,t.owner_id AS \"ownerId\",u.name,t.subject,t.bio,t.languages,t.photo_url AS \"photoUrl\" FROM teacher t JOIN app_user u ON u.id=t.owner_id";
    static final String SLOTS="SELECT s.id,s.teacher_id AS \"teacherId\",s.start_at AS start,s.end_at AS \"end\",s.closed FROM live_slot s";
    static final String BOOKINGS="SELECT b.id,b.slot_id AS \"slotId\",b.student_id AS \"studentId\",u.name AS \"studentName\",u.email AS \"studentEmail\",b.goals,b.timezone,b.status FROM booking b JOIN app_user u ON u.id=b.student_id";
    final Db db; private final CatalogService catalog;

    /** Share the database and catalog authorization rules with transactional live scheduling. */
    public LiveService(Db db,CatalogService catalog) { this.db=db; this.catalog=catalog; }

    /** List teacher profiles with names derived from their owning user accounts. */
    public Object teachers() { return db.list(TEACHERS+" ORDER BY u.name"); }

    /** List only future open slots without confirmed bookings, deliberately omitting meeting URLs. */
    public Object slots() { return db.list(SLOTS+" WHERE s.closed=FALSE AND s.start_at>? AND NOT EXISTS (SELECT b.id FROM booking b WHERE b.slot_id=s.id AND b.status='confirmed') ORDER BY s.start_at",System.currentTimeMillis()); }

    /**
     * Validate teaching privileges, taxonomy and photo data before inserting or updating the
     * principal's unique profile.
     */
    @Transactional public Object saveTeacher(TeacherInput input,AuthService.User user) {
        catalog.instructor(user); catalog.classification(input.subject,null); lock();
        String photo=input.photoUrl;
        Db.require(photo==null || photo.isEmpty() || photo.matches("^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$"),BAD_REQUEST,"Invalid teacher photo");
        var rows=db.list("SELECT id FROM teacher WHERE owner_id=?",user.id());
        String id=rows.isEmpty()?Db.id():(String)rows.get(0).get("id");
        if(rows.isEmpty()) db.update("INSERT INTO teacher(id,owner_id,subject,bio,languages,photo_url) VALUES (?,?,?,?,?,?)",id,user.id(),input.subject,input.bio.trim(),input.languages.trim(),photo);
        else db.update("UPDATE teacher SET subject=?,bio=?,languages=?,photo_url=? WHERE id=?",input.subject,input.bio.trim(),input.languages.trim(),photo,id);
        return db.one(TEACHERS+" WHERE t.id=?",id);
    }

    /**
     * Serialize availability creation and reject invalid future times, overlapping owned slots or
     * existing participant bookings.
     */
    @Transactional public Object addSlot(SlotInput input,AuthService.User user) {
        catalog.instructor(user); lock(); safeUrl(input.meetingUrl);
        Db.require(input.start>System.currentTimeMillis() && input.start<System.currentTimeMillis()+366L*86400000 && Set.of(30,45,60,90).contains(input.minutes),BAD_REQUEST,"Choose a future date within a year and duration 30, 45, 60 or 90 minutes");
        var teacher=db.one("SELECT id FROM teacher WHERE owner_id=?",user.id()); String tid=(String)teacher.get("id");
        long end=input.start+input.minutes*60000L;
        Db.require(!db.exists("SELECT id FROM live_slot WHERE teacher_id=? AND closed=FALSE AND start_at<? AND end_at>?",tid,end,input.start),CONFLICT,"Availability overlaps another slot");
        Db.require(!busy(user.id(),input.start,end,""),CONFLICT,"You already have a booking at this time");
        String id=Db.id(); db.update("INSERT INTO live_slot(id,teacher_id,start_at,end_at,meeting_url) VALUES (?,?,?,?,?)",id,tid,input.start,end,input.meetingUrl.trim());
        return Map.of("id",id,"teacherId",tid,"start",input.start,"end",end,"meetingUrl",input.meetingUrl.trim(),"closed",false);
    }

    /** Close an owned slot while retaining booking history; confirmed bookings block withdrawal. */
    @Transactional public void removeSlot(String id,AuthService.User user) {
        lock(); slotOwner(id,user);
        Db.require(!db.exists("SELECT id FROM booking WHERE slot_id=? AND status='confirmed'",id),CONFLICT,"Cancel active bookings first");
        db.update("UPDATE live_slot SET closed=TRUE WHERE id=?",id);
    }

    /** Serialize and authorize a meeting-link change before persisting a validated HTTPS URL. */
    @Transactional public void meeting(String id,String url,AuthService.User user) { lock(); slotOwner(id,user); safeUrl(url); db.update("UPDATE live_slot SET meeting_url=? WHERE id=?",url.trim(),id); }

    /**
     * Lock scheduling, authorize any replacement and check both participants' conflicts before
     * inserting. A replacement cancellation and new booking commit atomically or roll back together.
     */
    @Transactional public String book(BookInput input,AuthService.User user) {
        lock(); ZoneId.of(input.timezone);
        var slot=db.one("SELECT s.*,t.owner_id FROM live_slot s JOIN teacher t ON t.id=s.teacher_id WHERE s.id=?",input.slotId);
        long start=((Number)slot.get("start_at")).longValue(),end=((Number)slot.get("end_at")).longValue();
        Db.require(start>System.currentTimeMillis() && !Boolean.TRUE.equals(slot.get("closed")),CONFLICT,"Slot is closed or has started");
        String owner=(String)slot.get("owner_id"); Db.require(!owner.equals(user.id()),CONFLICT,"You cannot book your own class");
        String replacing=input.replacing==null?"":input.replacing;
        if(!replacing.isEmpty()) {
            var old=participant(replacing,user);
            Db.require(old.get("student_id").equals(user.id()) && old.get("status").equals("confirmed") && ((Number)old.get("start_at")).longValue()>System.currentTimeMillis(),CONFLICT,"Only your upcoming confirmed bookings can be rescheduled");
            Db.require(!old.get("slot_id").equals(input.slotId),CONFLICT,"Choose a different slot");
        }
        Db.require(!db.exists("SELECT id FROM booking WHERE slot_id=? AND status='confirmed' AND id<>?",input.slotId,replacing),CONFLICT,"Slot already booked");
        Db.require(!busy(user.id(),start,end,replacing) && !busy(owner,start,end,replacing),CONFLICT,"Booking overlaps another class for you or the teacher");
        if(!replacing.isEmpty()) db.update("UPDATE booking SET status='cancelled' WHERE id=?",replacing);
        String id=Db.id(); db.update("INSERT INTO booking(id,slot_id,student_id,goals,timezone,status) VALUES (?,?,?,?,?,'confirmed')",id,input.slotId,user.id(),input.goals.trim(),input.timezone); return id;
    }

    /**
     * Check overlapping confirmed classes across both student and teacher roles, excluding a booking
     * being replaced.
     */
    private boolean busy(String user,long start,long end,String exclude) {
        return db.exists("SELECT b.id FROM booking b JOIN live_slot s ON s.id=b.slot_id JOIN teacher t ON t.id=s.teacher_id WHERE b.status='confirmed' AND b.id<>? AND s.start_at<? AND s.end_at>? AND (b.student_id=? OR t.owner_id=?)",exclude,end,start,user,user);
    }

    /** Load participant-only bookings and attach their messages and private slot details. */
    public Object bookings(AuthService.User user) {
        var rows=db.list(BOOKINGS+" JOIN live_slot s ON s.id=b.slot_id JOIN teacher t ON t.id=s.teacher_id WHERE b.student_id=? OR t.owner_id=? ORDER BY s.start_at",user.id(),user.id());
        for(var row:rows) {
            row.put("messages",messages((String)row.get("id")));
            var slot=db.one(SLOTS+" WHERE s.id=?",row.get("slotId"));
            slot.put("meetingUrl",db.one("SELECT meeting_url FROM live_slot WHERE id=?",row.get("slotId")).get("meeting_url"));
            row.put("slot",slot);
        }
        return rows;
    }

    /** Serialize cancellation and permit it only for a participant's upcoming confirmed booking. */
    @Transactional public void cancel(String id,AuthService.User user) {
        lock(); var booking=participant(id,user);
        Db.require(booking.get("status").equals("confirmed") && ((Number)booking.get("start_at")).longValue()>System.currentTimeMillis(),CONFLICT,"Only upcoming confirmed classes can be cancelled");
        db.update("UPDATE booking SET status='cancelled' WHERE id=?",id);
    }

    /** Serialize conversation writes and persist text only for a participant of a confirmed booking. */
    @Transactional public Object message(String id,String text,AuthService.User user) {
        lock(); var booking=participant(id,user); Db.require(booking.get("status").equals("confirmed"),CONFLICT,"Booking is not confirmed");
        Db.require(text!=null && !text.trim().isEmpty() && text.length()<=500,BAD_REQUEST,"Enter 1..500 message characters");
        String mid=Db.id(); long now=System.currentTimeMillis(); db.update("INSERT INTO class_message(id,booking_id,sender_id,text,sent_at) VALUES (?,?,?,?,?)",mid,id,user.id(),text.trim(),now);
        return Map.of("id",mid,"senderId",user.id(),"senderName",user.name(),"text",text.trim(),"sentAt",now);
    }

    /**
     * Read chronologically ordered conversation entries; callers must authorize participation before
     * using this query.
     */
    public List<Map<String,Object>> messages(String id) { return db.list("SELECT m.id,m.sender_id AS \"senderId\",u.name AS \"senderName\",m.text,m.sent_at AS \"sentAt\" FROM class_message m JOIN app_user u ON u.id=m.sender_id WHERE m.booking_id=? ORDER BY m.sent_at,m.id",id); }

    /** Load persisted booking/class details and reject users who are neither its student nor its teacher. */
    public Map<String,Object> participant(String id,AuthService.User user) {
        var b=db.one("SELECT b.*,s.start_at,s.end_at,s.meeting_url,t.owner_id,t.subject,u.name AS teacher_name FROM booking b JOIN live_slot s ON s.id=b.slot_id JOIN teacher t ON t.id=s.teacher_id JOIN app_user u ON u.id=t.owner_id WHERE b.id=?",id);
        Db.require(user.id().equals(b.get("student_id")) || user.id().equals(b.get("owner_id")),FORBIDDEN,"Booking participants only"); return b;
    }

    /** List teaching availability and meeting links only for the current instructor owner. */
    public Object ownSlots(AuthService.User user) { catalog.instructor(user); return db.list("SELECT s.id,s.teacher_id AS \"teacherId\",s.start_at AS start,s.end_at AS \"end\",s.meeting_url AS \"meetingUrl\",s.closed FROM live_slot s JOIN teacher t ON t.id=s.teacher_id WHERE t.owner_id=? ORDER BY s.start_at",user.id()); }

    /** Require teaching privileges and verify the principal owns the slot's teacher profile. */
    private void slotOwner(String id,AuthService.User user) { catalog.instructor(user); Db.require(db.exists("SELECT s.id FROM live_slot s JOIN teacher t ON t.id=s.teacher_id WHERE s.id=? AND t.owner_id=?",id,user.id()),FORBIDDEN,"Only the slot owner can change it"); }

    /**
     * Acquire the shared database scheduling mutex inside a transaction to make conflict checks and
     * writes atomic across instances.
     */
    private void lock() { db.one("SELECT id FROM schedule_mutex WHERE id=1 FOR UPDATE"); }

    /** Allow an empty meeting link or a bounded HTTPS URL with a host and no embedded credentials. */
    private void safeUrl(String value) {
        Db.require(value!=null && value.length()<=2048,BAD_REQUEST,"Invalid meeting link"); if(value.isBlank()) return;
        try { var uri=URI.create(value.trim()); Db.require("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost()!=null && uri.getUserInfo()==null,BAD_REQUEST,"Use an HTTPS meeting link without credentials"); }
        catch(IllegalArgumentException e) { throw new org.springframework.web.server.ResponseStatusException(BAD_REQUEST,"Invalid meeting link"); }
    }
}
