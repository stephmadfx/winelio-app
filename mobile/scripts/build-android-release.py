#!/usr/bin/env python3
"""Build the store AAB locally using the existing upload key and macOS Keychain."""
import hashlib
import os
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
keystore = Path.home() / '.config/winelio-signing/upload.jks'
if not keystore.is_file():
    raise SystemExit('Signature locale absente : configurer la clé de publication existante.')


def signing_value(name):
    result = subprocess.run(
        ['security', 'find-generic-password', '-a', 'winelio', '-s', 'winelio.android.upload.' + name, '-w'],
        capture_output=True,
    )
    if result.returncode:
        raise SystemExit('Accès au trousseau nécessaire pour la signature Android.')
    return result.stdout.decode().rstrip('\n')


env = os.environ.copy()
java_home = env.get('JAVA_HOME') or '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
env.update(JAVA_HOME=java_home, ANDROID_HOME=env.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk')),
           EXPO_PUBLIC_WEB_APP_URL='https://winelio.app', EXPO_NO_TELEMETRY='1', NODE_ENV='production')
values = {name: signing_value(name) for name in ['storePassword', 'keyAlias', 'keyPassword']}
for name, value in {'store.file': str(keystore), 'store.password': values['storePassword'],
                    'key.alias': values['keyAlias'], 'key.password': values['keyPassword']}.items():
    env['ORG_GRADLE_PROJECT_android.injected.signing.' + name] = value
subprocess.run(['./gradlew', ':app:bundleRelease', '--no-daemon', '--no-configuration-cache'],
               cwd=root / 'android', env=env, check=True)
bundle = root / 'android/app/build/outputs/bundle/release/app-release.aab'
# Compare public certificates so a release accidentally signed with the debug key fails here.
env['WINELIO_STORE_PASSWORD'] = values['storePassword']
cert = subprocess.run([java_home + '/bin/keytool', '-exportcert', '-keystore', str(keystore),
                       '-storepass:env', 'WINELIO_STORE_PASSWORD', '-alias', values['keyAlias']],
                      env=env, capture_output=True, check=True).stdout
with zipfile.ZipFile(bundle) as archive:
    names = [name for name in archive.namelist() if name.startswith('META-INF/') and name.endswith('.RSA')]
    if len(names) != 1:
        raise SystemExit('Signature AAB absente ou ambiguë.')
    signature = archive.read(names[0])
pem = subprocess.run(['openssl', 'pkcs7', '-inform', 'DER', '-print_certs'], input=signature,
                     capture_output=True, check=True).stdout
actual = subprocess.run(['openssl', 'x509', '-outform', 'DER'], input=pem,
                        capture_output=True, check=True).stdout
if hashlib.sha256(actual).digest() != hashlib.sha256(cert).digest():
    raise SystemExit('La signature AAB ne correspond pas à la clé de publication.')
print('AAB local signé et certificat vérifié :', bundle)
