// Where a notification lands when tapped — shared by the push tap handler
// (app/_layout.tsx) and the bell-feed rows (app/notifications.tsx). Categories
// mirror the server catalog (web/lib/push/notify.ts NotifCategory).
//
// Resolution order:
//   1. `dest` — an explicit destination the server sets when the category is too
//      coarse (the "hunt" family covers The Hunt, smart-money scans, AND Chess
//      Moves boards). Push-only; bell rows don't carry it.
//   2. category rules — actionable / no-symbol categories go to their home
//      screen. fx beats the symbol on purpose: the agent's FX request names the
//      stock it wants to fund, but the approve/reject buttons live in Settings.
//   3. a symbol → its stock page.
//   4. nothing routable (e.g. a system hiccup) → null, the tap just opens the app.

const DEST_ROUTES: Record<string, string> = {
  'smart-money': '/more/smart-money',
  chess: '/more/chess',
  hunt: '/more/hunt',
};

export function routeForNotification(n: {
  category?: string | null;
  symbol?: string | null;
  dest?: string | null;
}): string | null {
  if (n.dest && DEST_ROUTES[n.dest]) return DEST_ROUTES[n.dest];
  switch (n.category) {
    case 'fx': // Currency & FX approvals
    case 'risk': // the kill switch
      return '/settings';
    case 'accounts':
      return '/portfolio?segment=personal'; // the ReconnectBanner lives on the Personal book
    case 'reports':
    case 'checkins':
      return '/portfolio'; // From the desk — the latest printout auto-opens
    case 'hunt':
      return '/more/hunt';
    case 'optionsDesk':
      return '/more/desk';
    case 'messages':
      // A stock share deep-links to the dossier (D59); a plain message opens the thread.
      return n.symbol ? `/stock/${n.symbol}` : '/messages';
  }
  return n.symbol ? `/stock/${n.symbol}` : null;
}
