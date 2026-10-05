import { useState, type CSSProperties, type ReactNode } from 'react';
import { useHoverIntent } from '../lib/hoverIntent';
import { useExitAnimation } from '../lib/exitAnimation';

export type ProfileSummary = { name: string; photo?: string; tag?: string; bio?: string; color?: string; cover?: string };

/** A small round profile picture; hovering or focusing it shows the profile card (read-only). */
export function ProfileHover({ profile, label, showName = false, extra }: { profile: ProfileSummary; label: string; showName?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const hover = useHoverIntent(setOpen);
  const exitRef = useExitAnimation<HTMLDivElement>();
  const initial = (profile.name || '?').slice(0, 1).toUpperCase();
  const cardStyle = {
    ...(profile.color ? { '--profile-accent': profile.color } : {}),
    ...(profile.cover ? { '--profile-cover': `url("${profile.cover}")` } : {}),
  } as CSSProperties;
  return <span className="profile-hover" {...hover} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
    <span className="collection-owner-avatar" tabIndex={0} role="img" aria-label={label}>{profile.photo ? <img src={profile.photo} alt="" /> : initial}</span>
    {showName && <span className="profile-hover-name">{profile.name || 'Duckler user'}{profile.tag && <small>@{profile.tag}</small>}</span>}
    {extra}
    {open && <div ref={exitRef} className="profile-hover-card" role="tooltip">
      <div className={`profile-identity-card ${profile.cover ? 'has-cover' : ''}`} style={cardStyle}>
        <span className="profile-avatar profile-avatar-large" aria-hidden="true">{profile.photo ? <img src={profile.photo} alt="" /> : <span>{initial}</span>}</span>
        <strong>{profile.name || 'Duckler user'}</strong>
        {profile.tag && <span>@{profile.tag}</span>}
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      </div>
    </div>}
  </span>;
}
