/**
 * Profil–kesim bütünlüğü: kesim kodu, ait olduğu profil kodu ile aynı olmalı veya
 * `{profilKodu}-{suffix}` biçiminde olmalı (büyük/küçük harf normalize edilir).
 */
export function cuttingCodeBelongsToProfile(
  profileCode: string,
  cuttingCode: string
): boolean {
  const profile = profileCode.trim().toUpperCase();
  const cutting = cuttingCode.trim().toUpperCase();

  if (profile.length === 0 || cutting.length === 0) {
    return false;
  }

  return cutting === profile || cutting.startsWith(`${profile}-`);
}
