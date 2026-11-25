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
                            @NotNull @Size(max=1000) String label,
                            @Pattern(regexp="solid|dashed|dotted") String strokeStyle,
                            @Min(2) @Max(20) Integer strokeWidth,
                            @DecimalMin("0.15") @DecimalMax("0.85") Double boxWidth,
                            Boolean equation, @Min(16) @Max(48) Integer fontSize) {}
    public record TextInput(@NotBlank @Size(max=1000) String label, @NotNull @Valid Point point,
                            @NotNull @DecimalMin("0.15") @DecimalMax("0.85") Double boxWidth,
                            @NotNull @Pattern(regexp="#[0-9a-fA-F]{6}") String color,
                            @PositiveOrZero long textRevision, Boolean equation, @Min(16) @Max(48) Integer fontSize) {}

    public record EraseInput(@NotBlank @Size(max=36) String slideId,
                             @NotEmpty @Size(max=500) List<@NotBlank @Size(max=36) String> markIds,
                             @NotEmpty @Size(max=180) List<@NotNull @Valid Point> points,
                             @Min(6) @Max(30) Integer radius) {}
    public record NoteInput(@NotBlank @Size(max=36) String slideId,
                            @NotNull @Pattern(regexp="yellow|pink") String color,
                            @Pattern(regexp="sticky|table|graph|flowchart") String kind,
                            boolean histogram,
                            @Pattern(regexp="pie|timer|number-line|fraction-bars|ten-frame|coordinate-grid|2d-shapes|ruler"
                                + "|number-blocks|abacus|place-value|math-operators|multiplication-grid"
                                + "|3d-shapes|line-tools|angles|polygon-tools|symmetry-tools|protractor|compass|set-square"
                                + "|area-perimeter|unit-converter|fraction-circles|fraction-number-line|decimal-grid"
                                + "|percentage-tool|fraction-calculator|equation-editor|algebra-tiles|equation-solver|inequality-tool"
                                + "|function-table|expression-builder|point-plotter|line-graph|function-grapher|transformations"
                                + "|right-triangle|soh-cah-toa|unit-circle|trig-graphs|pythagorean|angle-converter"
                                + "|mean-median-mode|probability-spinner|dice-coin|box-plot|matrix-tool|vector-tool"
                                + "|limits-derivatives|integral-graph|complex-plane") String widget) {}
    public record NoteBounds(@Min(0) @Max(1000) int x, @Min(0) @Max(1000) int y,
                             @Min(120) @Max(1000) int width, @Min(140) @Max(1000) int height) {}
    public record NoteUpdate(@Size(max=12000) String text, @Valid NoteBounds bounds) {}
    public record MathsMenuInput(@NotNull @Pattern(regexp="all|pre-k|elementary|secondary") String audience,
                                 boolean showAll) {}
    public record FlowPreview(@NotBlank @Size(max=36) String noteId, @Size(max=12000) String text, @Valid NoteBounds bounds,
                              @Min(0) @Max(19) int selectedBox, @Min(0) @Max(19) Integer linkSource,
                              @Pattern(regexp="terminal|process|decision|inputOutput|predefined|document|manual|delay|preparation") String pickedShape,
                              boolean shapesOpen, boolean connecting,
                              @NotNull @Pattern(regexp="editing|typing|moving|resizing|routing") String action) {}
    public record CalculatorPreview(@NotNull @Size(max=160) String expression, @NotNull @Size(max=160) String calculation,
                                    @NotNull @Size(max=80) String error,
                                    @NotNull @Pattern(regexp="standard|scientific") String mode,
                                    @NotNull @Pattern(regexp="deg|rad") String angleUnit) {}
    public record FlowPulse(@NotBlank @Size(max=36) String slideId, @Valid FlowPreview preview,
                            @Valid CalculatorPreview calculator) {}

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

    @PatchMapping("/maths-menu")
    public void updateMathsMenu(@PathVariable String slotId, @Valid @RequestBody MathsMenuInput input,
        @AuthenticationPrincipal AuthService.User user) {
        board.updateMathsMenu(slotId, input, user);
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

    @PatchMapping("/marks/{markId}/text")
    public void updateText(@PathVariable String slotId, @PathVariable String markId, @Valid @RequestBody TextInput input,
                           @AuthenticationPrincipal AuthService.User user) {
        board.updateText(slotId, markId, input, user);
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

    @PostMapping("/notes")
    public Object addNote(@PathVariable String slotId, @Valid @RequestBody NoteInput input,
        @AuthenticationPrincipal AuthService.User user) {
        return board.addNote(slotId, input, user);
    }

    @PostMapping("/flow-previews")
    public ResponseEntity<Object> flowPreviews(@PathVariable String slotId, @Valid @RequestBody FlowPulse input,
        @AuthenticationPrincipal AuthService.User user) {
        return privateResponse(board.classroomPreviews(slotId, input, user, false).flows());
    }

    @PostMapping("/classroom-previews")
    public ResponseEntity<Object> classroomPreviews(@PathVariable String slotId, @Valid @RequestBody FlowPulse input,
        @AuthenticationPrincipal AuthService.User user) {
        return privateResponse(board.classroomPreviews(slotId, input, user, true));
    }

    @PatchMapping("/notes/{noteId}")
    public void updateNote(@PathVariable String slotId, @PathVariable String noteId,
        @Valid @RequestBody NoteUpdate input, @AuthenticationPrincipal AuthService.User user) {
        board.updateNote(slotId, noteId, input, user);
    }

    @DeleteMapping("/notes/{noteId}")
    public void deleteNote(@PathVariable String slotId, @PathVariable String noteId,
        @AuthenticationPrincipal AuthService.User user) {
        board.deleteNote(slotId, noteId, user);
    }

    private ResponseEntity<Object> privateResponse(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
