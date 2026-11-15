import { Component } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `<span class="logo-frame"><img src="assets/sikai-brand-reference.png" alt="Sikai" width="1579" height="996" /></span>`,
  styles: [`
    :host { display: block; width: 180px; flex-shrink: 0; }
    /* Display the exact logo in the top-left corner of the supplied reference.
       The frame excludes the reference navigation and page content. */
    .logo-frame { display: block; position: relative; overflow: hidden; aspect-ratio: 171 / 54; }
    img { position: absolute; width: 923.3918%; height: 1844.4444%; max-width: none; left: -63.1579%; top: -18.5185%; }
    @media (max-width: 740px) { :host { width: 145px; } }
  `],
})
export class BrandLogoComponent {}
