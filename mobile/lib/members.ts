// The two-member fund, client-side: who am I, who's the other one. Mirrors
// web/lib/users.ts — the server stays the authority (/api/chat re-validates
// owner server-side); this only drives UI labels, avatars, and the owner param.
export type MemberInfo = { key: 'cam' | 'graham'; name: string; email: string; avatar: number };

const CAM: MemberInfo = {
  key: 'cam',
  name: 'Cam',
  email: 'cameron.tora@gmail.com',
  avatar: require('../assets/people/cam.png'),
};
const GRAHAM: MemberInfo = {
  key: 'graham',
  name: 'Graham',
  email: 'g.j.appleby@gmail.com',
  avatar: require('../assets/people/graham.png'),
};

export function memberFor(email: string | null | undefined): MemberInfo {
  return email?.includes('appleby') ? GRAHAM : CAM;
}

export function otherMember(email: string | null | undefined): MemberInfo {
  return email?.includes('appleby') ? CAM : GRAHAM;
}
