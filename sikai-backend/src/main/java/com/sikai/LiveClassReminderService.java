package com.sikai;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class LiveClassReminderService {
    private static final Logger log = LoggerFactory.getLogger(LiveClassReminderService.class);
    private static final int ONE_DAY = 1_440;
    private static final int FIFTEEN_MINUTES = 15;

    private final Db db;
    private final ConfirmationService email;
    private final TransactionTemplate transactions;
    private final boolean enabled;

    public LiveClassReminderService(Db db, ConfirmationService email, PlatformTransactionManager manager,
                                    @Value("${sikai.email-enabled}") boolean enabled) {
        this.db = db;
        this.email = email;
        this.transactions = new TransactionTemplate(manager);
        this.enabled = enabled;
    }

    @Scheduled(initialDelay = 30_000, fixedDelay = 30_000)
    public void sendDueReminders() {
        if (!enabled) return;
        sendWindow(FIFTEEN_MINUTES, 0, "15-minute");
        sendWindow(ONE_DAY, FIFTEEN_MINUTES, "24-hour");
    }

    private void sendWindow(int lead, int nextLead, String label) {
        long now = System.currentTimeMillis();
        long upper = Duration.ofMinutes(lead).toMillis();
        long lower = Duration.ofMinutes(nextLead).toMillis();
        var candidates = db.list("""
            SELECT b.id FROM live_slot s JOIN booking b ON b.slot_id = s.id
            WHERE s.start_at > ? AND s.start_at <= ? AND s.closed = FALSE AND b.status = 'confirmed'
              AND NOT EXISTS (SELECT 1 FROM live_class_reminder r WHERE r.booking_id = b.id AND r.lead_minutes = ?)
            ORDER BY s.start_at, b.id
            """, now + lower, now + upper, lead);

        for (var candidate : candidates) {
            String id = (String) candidate.get("id");
            try {
                transactions.executeWithoutResult(status -> sendIfDue(id, lead, lower, upper, label));
            } catch (MailException failure) {
                log.warn("Live class reminder delivery failed for booking {} ({}); will retry while due", id, label);
            }
        }
    }

    private void sendIfDue(String id, int lead, long lower, long upper, String label) {
        // Lock only this booking to coordinate workers and concurrent cancellation or rescheduling.
        if (!db.exists("SELECT id FROM booking WHERE id = ? AND status = 'confirmed' FOR UPDATE", id)) return;

        long now = System.currentTimeMillis();
        var eligible = db.list("""
            SELECT b.timezone, s.start_at, s.meeting_url, t.subject,
                   instructor.name AS teacher_name, student.name AS student_name, student.email
            FROM booking b
            JOIN live_slot s ON s.id = b.slot_id
            JOIN teacher t ON t.id = s.teacher_id
            JOIN app_user instructor ON instructor.id = t.owner_id
            JOIN app_user student ON student.id = b.student_id
            WHERE b.id = ? AND s.start_at > ? AND s.start_at <= ? AND s.closed = FALSE
              AND NOT EXISTS (SELECT 1 FROM live_class_reminder r WHERE r.booking_id = b.id AND r.lead_minutes = ?)
            """, id, now + lower, now + upper, lead);
        if (eligible.isEmpty()) return;

        email.sendReminder(eligible.get(0), label);
        db.update("INSERT INTO live_class_reminder(booking_id, lead_minutes, sent_at) VALUES (?, ?, ?)",
            id, lead, System.currentTimeMillis());
    }
}
