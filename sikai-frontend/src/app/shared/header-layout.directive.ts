import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** Keep sticky page panels below the header as its navigation wraps or fonts resize. */
@Directive({ selector: '[appHeaderLayout]', standalone: true })
export class HeaderLayoutDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Measure the rendered header and observe size changes; disconnect and remove the CSS offset when its view is destroyed. */
  constructor() {
    afterNextRender(() => {
      const header = this.element.nativeElement;
      const root = header.ownerDocument.documentElement;
      /** Publish the complete wrapped header height so sticky page panels stay below both navigation rows. */
      const update = () => root.style.setProperty('--site-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
      const observer = new ResizeObserver(update);
      update();
      observer.observe(header);
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        root.style.removeProperty('--site-header-height');
      });
    });
  }
}
