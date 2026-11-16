package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Public teacher discovery; bookings, meeting links and messages remain participant-only. */
@RestController
@RequestMapping("/api/live-classes")
public class LiveController {
    /** An empty URL removes the link; nonempty values must pass the service's HTTPS checks. */
    record Meeting(@NotNull @Size(max=2048) String meetingUrl) {}
    /** Conversation text is bounded; sender identity comes from the authenticated principal. */
    record Message(@NotBlank @Size(max=500) String text) {}
    /** A resend references a saved booking, never an arbitrary recipient or client-supplied class details. */
    record Confirmation(@NotBlank String bookingId) {}
    private final LiveService live; private final ConfirmationService confirmation;

    /** Connect live-class endpoints to transactional scheduling and post-commit email delivery. */
    public LiveController(LiveService live,ConfirmationService confirmation) { this.live=live; this.confirmation=confirmation; }

    /** Return public teacher profiles for discovery. */
    @GetMapping("/teachers") public Object teachers() { return live.teachers(); }

    /** Return future unbooked availability without exposing private meeting links. */
    @GetMapping("/slots") public Object slots() { return live.slots(); }

    /** Validate and save the authenticated instructor's teacher profile. */
    @PutMapping("/teacher") public Object teacher(@Valid @RequestBody LiveService.TeacherInput input,@AuthenticationPrincipal AuthService.User user) { return live.saveTeacher(input,user); }

    /** List owned availability, including meeting links, for the teaching dashboard. */
    @GetMapping("/teacher/slots") public Object ownSlots(@AuthenticationPrincipal AuthService.User user) { return live.ownSlots(user); }

    /** Validate availability input and create a slot through transactional scheduling checks. */
    @PostMapping("/slots") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object add(@Valid @RequestBody LiveService.SlotInput input,@AuthenticationPrincipal AuthService.User user) { return live.addSlot(input,user); }

    /** Close an owned slot after the service verifies that no confirmed booking remains. */
    @DeleteMapping("/slots/{id}") public Object remove(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { live.removeSlot(id,user); return Map.of("success",true); }

    /** Update an owned slot's HTTPS meeting link; confirmation resend is a separate request. */
    @PatchMapping("/slots/{id}/meeting") public Object meeting(@PathVariable String id,@Valid @RequestBody Meeting input,@AuthenticationPrincipal AuthService.User user) { live.meeting(id,input.meetingUrl,user); return Map.of("success",true); }

    /** Return only bookings in which the principal is the student or teacher. */
    @GetMapping("/bookings") public Object bookings(@AuthenticationPrincipal AuthService.User user) { return live.bookings(user); }

    /** Commit a new or replacement booking before requesting optional confirmation email. */
    @PostMapping("/bookings") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object book(@Valid @RequestBody LiveService.BookInput input,@AuthenticationPrincipal AuthService.User user) {
        String id=live.book(input,user); return Map.of("id",id,"status","confirmed","email",confirmation.send(id,user));
    }

    /** Cancel an upcoming confirmed booking after participant authorization. */
    @PostMapping("/bookings/{id}/cancel") public Object cancel(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { live.cancel(id,user); return Map.of("success",true); }

    /** Authorize participation before returning the booking conversation. */
    @GetMapping("/bookings/{id}/messages") public Object messages(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { live.participant(id,user); return live.messages(id); }

    /** Validate message text and post it through confirmed-booking participant checks. */
    @PostMapping("/bookings/{id}/messages") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Object message(@PathVariable String id,@Valid @RequestBody Message input,@AuthenticationPrincipal AuthService.User user) { return live.message(id,input.text,user); }

    /**
     * Request a resend using a persisted booking ID; recipient and class details are never trusted
     * from the client.
     */
    @PostMapping("/confirmation") public Object confirmation(@Valid @RequestBody Confirmation input,@AuthenticationPrincipal AuthService.User user) { return confirmation.send(input.bookingId,user); }
}
