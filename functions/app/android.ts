// donpunto.com/app/android → APK firmado más reciente (release fija "android-latest" del repo).
// Lo compila .github/workflows/android-apk.yml en cada cambio de native/.
export const onRequestGet: PagesFunction = async () =>
  Response.redirect('https://github.com/bunkercreativomx-maker/don-punto/releases/download/android-latest/DonPunto.apk', 302);
