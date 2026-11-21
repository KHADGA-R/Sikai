package com.sikai;

import java.time.*;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/** Email uses persisted booking details and recipients, never arbitrary client email payloads. */
@Service
public class ConfirmationService {
    private final Db db; private final LiveService live; private final JavaMailSender mail;
    private final boolean enabled; private final String from;

    /** Configure optional SMTP delivery and the sender address for persisted booking confirmations. */
    public ConfirmationService(Db db,LiveService live,JavaMailSender mail,@Value("${sikai.email-enabled}") boolean enabled,@Value("${sikai.email-from}") String from) { this.db=db; this.live=live; this.mail=mail; this.enabled=enabled; this.from=from; }

    /**
     * Authorize the booking participant and build email from saved class details and student identity.
     * Disabled or failed delivery returns a notice and does not undo the already committed booking.
     */
    public Map<String,Object> send(String id,AuthService.User user) {
        var booking=live.participant(id,user);
        Db.require("confirmed".equals(booking.get("status")),org.springframework.http.HttpStatus.CONFLICT,"Booking is not confirmed");
        if(!enabled) return Map.of("sent",false,"message","SMTP email is disabled; booking is saved");
        var student=db.one("SELECT name,email FROM app_user WHERE id=?",booking.get("student_id"));
        var message=new SimpleMailMessage(); message.setFrom(from); message.setTo((String)student.get("email")); message.setSubject("Sikai live-class confirmation");
        String start=startTime(booking);
        message.setText("Hello "+student.get("name")+",\nYour class with "+booking.get("teacher_name")+" is confirmed.\nSubject: "+booking.get("subject")+"\nStarts: "+start+"\nMeeting: "+booking.get("meeting_url")+"\nGoals: "+booking.get("goals")+"\nBooking: "+id);
        try { mail.send(message); return Map.of("sent",true); }
        catch(org.springframework.mail.MailException e) { LoggerFactory.getLogger(getClass()).warn("Confirmation delivery failed for booking {}",id); return Map.of("sent",false,"message","Email delivery failed; booking is saved"); }
    }

    void sendReminder(Map<String,Object> booking, String label) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo((String) booking.get("email"));
        message.setSubject("Sikai live class: " + label + " reminder");
        String meeting = (String) booking.get("meeting_url");
        message.setText("Hello " + booking.get("student_name") + ",\n\n"
            + "Your live class with " + booking.get("teacher_name") + " is coming up.\n"
            + "Subject: " + booking.get("subject") + "\n"
            + "Starts: " + startTime(booking) + "\n"
            + (meeting.isBlank() ? "Check Live Classes > My Bookings for the meeting link."
                : "Meeting: " + meeting));
        mail.send(message);
    }

    private String startTime(Map<String,Object> booking) {
        return Instant.ofEpochMilli(((Number) booking.get("start_at")).longValue())
            .atZone(ZoneId.of((String) booking.get("timezone"))).toString();
    }
}
