import { Component, DestroyRef, Directive, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { Participant, Room, RoomEvent, Track } from 'livekit-client';
import { ApiService } from '../core/api.service';

export type ClassroomView = 'presentation' | 'whiteboard' | 'split';

@Directive({ selector: '[classroomTrack]', standalone: true })
export class ClassroomTrackDirective {
  readonly classroomTrack = input<Track>();
  private readonly element = inject<ElementRef<HTMLMediaElement>>(ElementRef);

  constructor() {
    effect(onCleanup => {
      const track = this.classroomTrack();
      if (!track) return;
      const media = this.element.nativeElement;
      track.attach(media);
      onCleanup(() => { track.detach(media); });
    });
  }
}

interface VideoParticipant {
  id: string;
  name: string;
  local: boolean;
  camera?: Track;
  screen?: Track;
  audio: { id: string; track: Track }[];
}

@Component({
  selector: 'app-classroom-video',
  standalone: true,
  imports: [ClassroomTrackDirective],
  templateUrl: './classroom-video.component.html',
  styleUrl: './classroom-video.component.css',
})
export class ClassroomVideoComponent {
  readonly slotId = input.required<string>();
  readonly autoJoin = input(false);
  readonly view = input<ClassroomView>('whiteboard');
  readonly instructorId = input('');
  readonly shareChanged = output<boolean>();
  readonly expandPresentation = output<void>();
  readonly left = output<void>();
  private readonly api = inject(ApiService);
  private room?: Room;
  private triedAutoJoin = false;
  readonly state = signal<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  readonly participants = signal<VideoParticipant[]>([]);
  readonly collapsed = signal(false);
  readonly gallery = signal(false);
  readonly activeSpeakers = signal<string[]>([]);
  readonly fullscreen = signal(false);
  readonly orderedParticipants = computed(() => {
    const people = this.participants();
    const teacher = people.find(person => person.id === this.instructorId());
    return teacher ? [teacher, ...people.filter(person => person !== teacher)] : people;
  });
  readonly sharedScreens = computed(() => this.participants().filter(person => !!person.screen));
  private hasScreen = false;
  readonly audioBlocked = signal(false);
  readonly microphone = signal(false);
  readonly camera = signal(false);
  readonly sharing = signal(false);
  readonly canShare = signal(false);
  readonly changingMedia = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => {
      if (this.autoJoin() && !this.triedAutoJoin) {
        this.triedAutoJoin = true;
        void this.join();
      }
    });
    inject(DestroyRef).onDestroy(() => { void this.leave(); });
  }

  async join(): Promise<void> {
    if (this.room) return;
    this.error.set('');
    this.state.set('connecting');
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    const refresh = () => {
      if (this.room === room) this.refresh(room);
    };
    for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed, RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished, RoomEvent.AudioPlaybackStatusChanged] as const) {
      room.on(event, refresh);
    }
    room.on(RoomEvent.Reconnecting, () => { if (this.room === room) this.state.set('reconnecting'); });
    room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
      if (this.room === room) this.activeSpeakers.set(speakers.map(speaker => speaker.identity));
    });
    room.on(RoomEvent.Reconnected, () => {
      if (this.room !== room) return;
      this.state.set('connected');
      refresh();
    });
    room.on(RoomEvent.Disconnected, () => {
      if (this.room !== room) return;
      this.reset();
      this.error.set('Video disconnected. You can join again.');
    });
    try {
      const credentials = await this.api.request<{ url: string; token: string; canShareScreen: boolean }>(
        'POST', '/live-classes/slots/' + encodeURIComponent(this.slotId()) + '/video-token');
      if (this.room !== room) return;
      await room.connect(credentials.url, credentials.token);
      if (this.room !== room) {
        await room.disconnect();
        return;
      }
      this.canShare.set(credentials.canShareScreen);
      this.state.set('connected');
      refresh();
    } catch (error) {
      if (this.room !== room) return;
      this.reset();
      await room.disconnect();
      this.error.set(error instanceof Error ? error.message : 'Unable to join the video call.');
    }
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.reset();
    if (room) await room.disconnect();
  }

  async leaveClass(): Promise<void> {
    try { await this.leave(); } finally { this.left.emit(); }
  }

  async toggleFullscreen(stage: HTMLElement): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (stage.requestFullscreen) {
      try {
        await stage.requestFullscreen();
        return;
      } catch { /* Presentation view is available if fullscreen is blocked. */ }
    }
    this.expandPresentation.emit();
  }

  updateFullscreen(): void {
    this.fullscreen.set(!!document.fullscreenElement);
  }

  async toggle(kind: 'camera' | 'microphone' | 'screen'): Promise<void> {
    const room = this.room;
    if (!room || this.state() !== 'connected' || this.changingMedia()) return;
    if (kind === 'screen' && !this.canShare()) return;
    this.changingMedia.set(true);
    this.error.set('');
    try {
      const local = room.localParticipant;
      if (kind === 'camera') await local.setCameraEnabled(!local.isCameraEnabled);
      else if (kind === 'microphone') await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      else await local.setScreenShareEnabled(!local.isScreenShareEnabled);
      if (this.room === room) this.refresh(room);
    } catch {
      if (this.room === room) this.error.set('Could not start ' + (kind === 'screen' ? 'screen sharing' : 'the ' + kind) + '. Check your browser permissions.');
    } finally {
      if (this.room === room) this.changingMedia.set(false);
    }
  }

  async enableAudio(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try { await room.startAudio(); } catch { this.error.set('The browser blocked audio playback.'); }
  }

  private refresh(room: Room): void {
    const local = room.localParticipant;
    const participants = [local, ...room.remoteParticipants.values()];
    this.participants.set(participants.map(participant => this.participantView(participant, participant === local)));
    const sharingScreen = this.sharedScreens().length > 0;
    if (sharingScreen !== this.hasScreen) {
      this.hasScreen = sharingScreen;
      this.shareChanged.emit(sharingScreen);
    }
    this.microphone.set(local.isMicrophoneEnabled);
    this.camera.set(local.isCameraEnabled);
    this.sharing.set(local.isScreenShareEnabled);
    this.audioBlocked.set(!room.canPlaybackAudio);
  }

  private participantView(participant: Participant, local: boolean): VideoParticipant {
    const video = (source: Track.Source) => {
      const publication = participant.getTrackPublication(source);
      return publication && !publication.isMuted ? publication.track : undefined;
    };
    const audio = local ? [] : [...participant.audioTrackPublications.values()].flatMap(publication =>
      publication.track ? [{ id: publication.trackSid, track: publication.track }] : []);
    return { id: participant.identity, name: participant.name || 'Participant', local, camera: video(Track.Source.Camera),
      screen: video(Track.Source.ScreenShare), audio };
  }

  private reset(): void {
    this.room = undefined;
    this.state.set('idle');
    this.participants.set([]);
    this.activeSpeakers.set([]);
    this.gallery.set(false);
    if (this.hasScreen) {
      this.hasScreen = false;
      this.shareChanged.emit(false);
    }
    this.microphone.set(false);
    this.camera.set(false);
    this.sharing.set(false);
    this.canShare.set(false);
    this.audioBlocked.set(false);
    this.changingMedia.set(false);
  }
}
