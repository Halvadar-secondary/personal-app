/** What the sidebar and tab bar show; a slice of the overview read model. */
export type NavData = {
  inboxCount: number;
  areas: { id: string; name: string; emoji: string | null }[];
};
