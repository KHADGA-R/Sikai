package com.sikai;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:sikai-reminders;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "sikai.email-enabled=true", "sikai.admin-email=", "sikai.admin-password=", "debug=false"
})
class LiveClassReminderIntegrationTest {
    @Autowired Db db;
    @Autowired LiveClassReminderService reminders;
    @MockitoBean JavaMailSender mail;

    @Test
    void sendsBothRemindersOnceAndRetriesFailedDeliveryForConfirmedUpcomingClasses() {
        db.update("INSERT INTO app_user(id,name,email,password_hash,role) VALUES ('teacher','Teacher','teacher@example.test','unused','instructor'), ('student','Student','student@example.test','unused','student')");
        db.update("INSERT INTO teacher(id,owner_id,subject,bio,languages) VALUES ('profile','teacher','Music','','')");
        createBooking("upcoming", 1439, "confirmed");
        createBooking("cancelled", 10, "cancelled");
        createBooking("past", -5, "confirmed");
        createBooking("too-early", 1500, "confirmed");

        var messages = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        reminders.sendDueReminders();
        reminders.sendDueReminders();
        verify(mail).send(messages.capture());
        var dayBefore = messages.getValue();
        assertThat(dayBefore.getTo()).containsExactly("student@example.test");
        assertThat(dayBefore.getSubject()).contains("24-hour");
        assertThat(dayBefore.getText()).contains("Music", "Asia/Kathmandu", "https://example.test/meeting");

        long start = System.currentTimeMillis() + Duration.ofMinutes(14).toMillis();
        db.update("UPDATE live_slot SET start_at = ?, end_at = ? WHERE id = 'upcoming'",
            start, start + Duration.ofMinutes(30).toMillis());
        doThrow(new MailSendException("Temporary failure")).doNothing().when(mail).send(any(SimpleMailMessage.class));
        reminders.sendDueReminders();
        assertThat(db.exists("SELECT 1 FROM live_class_reminder WHERE lead_minutes = 15")).isFalse();
        reminders.sendDueReminders();
        reminders.sendDueReminders();

        verify(mail, times(3)).send(messages.capture());
        assertThat(messages.getValue().getSubject()).contains("15-minute");
        assertThat(db.list("SELECT booking_id, lead_minutes FROM live_class_reminder ORDER BY lead_minutes"))
            .hasSize(2).allSatisfy(row -> assertThat(row.get("booking_id")).isEqualTo("upcoming"));
    }

    private void createBooking(String id, int minutesUntilStart, String status) {
        long start = System.currentTimeMillis() + Duration.ofMinutes(minutesUntilStart).toMillis();
        db.update("INSERT INTO live_slot(id,teacher_id,start_at,end_at,meeting_url) VALUES (?,'profile',?,?,'https://example.test/meeting')",
            id, start, start + Duration.ofMinutes(30).toMillis());
        db.update("INSERT INTO booking(id,slot_id,student_id,goals,timezone,status) VALUES (?,?,'student','','Asia/Kathmandu',?)",
            id, id, status);
    }
}
