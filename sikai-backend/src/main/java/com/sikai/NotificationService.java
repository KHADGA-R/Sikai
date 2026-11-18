package com.sikai;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Domain notifications commit with their originating change; no client can choose a recipient. */
@Service
public class NotificationService {
    private final Db db;
    public NotificationService(Db db) { this.db=db; }

    private void send(String recipient,String type,String title,String body,String target,String event,String group) {
        if(group!=null) {
            var unread=db.list("SELECT id FROM app_notification WHERE user_id=? AND group_key=? AND read_at IS NULL ORDER BY created_at DESC",recipient,group);
            if(!unread.isEmpty() && db.update("UPDATE app_notification SET type=?,title=?,body=?,target=?,created_at=? WHERE id=? AND read_at IS NULL",type,title,clip(body,600),target,System.currentTimeMillis(),unread.get(0).get("id"))>0) return;
        }
        if(!db.exists("SELECT id FROM app_notification WHERE user_id=? AND event_key=?",recipient,event))
            db.update("INSERT INTO app_notification(id,user_id,type,title,body,target,event_key,group_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)",Db.id(),recipient,type,title,clip(body,600),target,event,group,System.currentTimeMillis());
    }
    private static String clip(String value,int limit) { return value.substring(0,Math.min(limit,value.length())); }

    /** Enrollment callers already serialize writes by buyer; retries emit no duplicate events. */
    public void enrolled(long courseId,AuthService.User student) {
        var course=db.one("SELECT title,owner_id FROM course WHERE id=?",courseId);
        String event="enrollment:"+courseId+":"+student.id();
        send(student.id(),"enrollment","You're enrolled", "You can now start "+course.get("title")+".","/learn/"+courseId,event,null);
        String teacher=course.get("owner_id").toString();
        if(!teacher.equals(student.id())) send(teacher,"new_student","New course enrollment",student.name()+" enrolled in "+course.get("title")+".","/instructor/courses",event,null);
    }

    /** The first completion is recorded only for an enrolled learner with every real lesson done. */
    public void completed(long courseId,AuthService.User student) {
        if(!db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",student.id(),courseId)) return;
        long total=((Number)db.one("SELECT COUNT(*) AS total FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=?",courseId).get("total")).longValue();
        long done=((Number)db.one("SELECT COUNT(*) AS total FROM progress p JOIN lesson l ON l.id=p.lesson_id JOIN topic t ON t.id=l.topic_id WHERE p.user_id=? AND t.course_id=?",student.id(),courseId).get("total")).longValue();
        if(total==0 || done!=total) return;
        var course=db.one("SELECT title,owner_id FROM course WHERE id=?",courseId);
        String event="completion:"+courseId+":"+student.id();
        send(student.id(),"course_completed","Course completed!","You completed "+course.get("title")+". Keep growing!","/completed-courses",event,null);
        String teacher=course.get("owner_id").toString();
        if(!teacher.equals(student.id())) send(teacher,"student_completed","A student completed your course",student.name()+" completed "+course.get("title")+".","/instructor/courses",event,null);
    }

    @Transactional public void courseUpdated(long courseId) { courseUpdated(courseId,false); }
    /** Serialize on the course to coalesce a multi-request save into one unread update per learner. */
    @Transactional public void courseUpdated(long courseId,boolean availabilityChanged) {
        var course=db.one("SELECT title,published,owner_id FROM course WHERE id=? FOR UPDATE",courseId);
        boolean published=Boolean.TRUE.equals(course.get("published"));
        if(!published && !availabilityChanged) return;
        String title=published?"Course updated":"Course availability changed";
        String body=published?course.get("title")+" has updated details or learning materials.":course.get("title")+" is currently unavailable. Check My Learning for your courses.";
        String target=published?"/learn/"+courseId:"/my-learning";
        for(var row:db.list("SELECT user_id FROM enrollment WHERE course_id=? AND user_id<>?",courseId,course.get("owner_id")))
            send(row.get("user_id").toString(),"course_updated",title,body,target,"course-update:"+Db.id(),"course-update:"+courseId);
    }

    /** Participant-only class updates omit meeting links, goals, and private message contents. */
    public void liveEvent(String bookingId,String type,String eventId,String actorId) {
        var booking=db.one("SELECT b.student_id,t.owner_id,su.name AS student,tu.name AS teacher FROM booking b JOIN live_slot s ON s.id=b.slot_id JOIN teacher t ON t.id=s.teacher_id JOIN app_user su ON su.id=b.student_id JOIN app_user tu ON tu.id=t.owner_id WHERE b.id=?",bookingId);
        String student=booking.get("student_id").toString(),teacher=booking.get("owner_id").toString();
        String title=switch(type) { case "live_booked" -> "Live class booked"; case "live_rescheduled" -> "Live class rescheduled"; case "live_cancelled" -> "Live class cancelled"; case "live_message" -> "New class message"; default -> "Meeting details updated"; };
        for(String recipient:List.of(student,teacher)) {
            if((type.equals("live_message") || type.equals("meeting_updated") || type.equals("live_cancelled")) && recipient.equals(actorId)) continue;
            String other=recipient.equals(student)?booking.get("teacher").toString():booking.get("student").toString();
            String body=switch(type) {
                case "live_booked" -> "Your live class with "+other+" is confirmed.";
                case "live_rescheduled" -> "Your live class with "+other+" has been rescheduled. Check the new time.";
                case "live_cancelled" -> "Your live class with "+other+" has been cancelled.";
                case "live_message" -> other+" sent you a message about your live class.";
                default -> "The meeting details for your class with "+other+" have changed.";
            };
            String group=type.equals("live_message") || type.equals("meeting_updated")?type+":"+bookingId:null;
            send(recipient,type,title,body,"/live-classes",type+":"+eventId,group);
        }
    }
}
