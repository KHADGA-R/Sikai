package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/live-classes/slots/{slotId}/whiteboard")
public class WhiteboardController {
    public record SlideInput(@NotBlank @Size(max=100) String title,
                             @NotNull @Size(max=2_800_000) String image) {}
    public record Point(@NotNull @DecimalMin("0") @DecimalMax("1") Double x,
                        @NotNull @DecimalMin("0") @DecimalMax("1") Double y) {}
    public record MarkInput(@NotBlank @Size(max=36) String slideId,
                            @Pattern(regexp="pen|highlighter|text|line|rectangle|ellipse|circle|arrow") @NotNull String tool,
                            @Pattern(regexp="#[0-9a-fA-F]{6}") @NotNull String color,
                            @NotEmpty @Size(max=180) List<@NotNull @Valid Point> points,
                            @NotNull @Size(max=200) String label,
                            @Pattern(regexp="solid|dashed|dotted") String strokeStyle,
                            @Min(2) @Max(20) Integer strokeWidth) {}

    public record EraseInput(@NotBlank @Size(max=36) String slideId,
                             @NotEmpty @Size(max=500) List<@NotBlank @Size(max=36) String> markIds,
                             @NotEmpty @Size(max=180) List<@NotNull @Valid Point> points,
                             @Min(6) @Max(30) Integer radius) {}

    private final WhiteboardService board;

    public WhiteboardController(WhiteboardService board) { this.board = board; }

    @GetMapping
    public ResponseEntity<Object> state(@PathVariable String slotId,
        @RequestParam(defaultValue="blank") String slideId, @RequestParam(defaultValue="-1") long revision,
        @AuthenticationPrincipal AuthService.User user) {
        return privateResponse(board.state(slotId, slideId, revision, user));
    }

    @GetMapping("/slides/{slideId}")
    public ResponseEntity<Object> image(@PathVariable String slotId, @PathVariable String slideId,
        @AuthenticationPrincipal AuthService.User user) {
        return privateResponse(board.image(slotId, slideId, user));
    }

    @PostMapping("/slides")
    public Object addSlide(@PathVariable String slotId, @Valid @RequestBody SlideInput input,
        @AuthenticationPrincipal AuthService.User user) {
        return board.addSlide(slotId, input, user);
    }

    @PostMapping("/marks")
    public Object addMark(@PathVariable String slotId, @Valid @RequestBody MarkInput input,
        @AuthenticationPrincipal AuthService.User user) {
        return board.addMark(slotId, input, user);
    }

    @DeleteMapping("/marks/{markId}")
    public void deleteMark(@PathVariable String slotId, @PathVariable String markId,
        @AuthenticationPrincipal AuthService.User user) {
        board.deleteMark(slotId, markId, user);
    }

    @PostMapping("/erasures")
    public void erase(@PathVariable String slotId, @Valid @RequestBody EraseInput input,
        @AuthenticationPrincipal AuthService.User user) {
        board.erase(slotId, input, user);
    }

    private ResponseEntity<Object> privateResponse(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
