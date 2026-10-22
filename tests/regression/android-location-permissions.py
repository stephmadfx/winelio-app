"""Execute the installed WebView's actual permission handlers with Android stubs."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
config = json.loads((root / 'mobile/app.json').read_text())['expo']['android']
assert {'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'} <= set(config['permissions'])
source = (root / 'mobile/node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebChromeClient.java').read_text()
prompt = source.split('public void onGeolocationPermissionsShowPrompt', 1)[1].split('    private PermissionAwareActivity', 1)[0]
listener = source.split('    private PermissionListener webviewPermissionsListener', 1)[1].split('    protected void openFileChooser', 1)[0]
java = '''
import java.util.*;
public class LocationPermissionTest {
  static class Manifest { static class permission {
    static final String ACCESS_FINE_LOCATION="fine", ACCESS_COARSE_LOCATION="coarse", RECORD_AUDIO="audio", CAMERA="camera";
  }}
  static class PackageManager { static final int PERMISSION_GRANTED=0; }
  static class ContextCompat {
    static Set<String> granted = new HashSet<>();
    static int checkSelfPermission(Object context, String permission) { return granted.contains(permission) ? 0 : -1; }
  }
  static class GeolocationPermissions { interface Callback { void invoke(String origin, boolean allowed, boolean retain); }}
  interface PermissionListener { boolean onRequestPermissionsResult(int code, String[] permissions, int[] results); }
  static class PermissionRequest {
    static final String RESOURCE_AUDIO_CAPTURE="audio", RESOURCE_VIDEO_CAPTURE="camera", RESOURCE_PROTECTED_MEDIA_ID="media";
    List<String> received;
    void grant(String[] values) { received=Arrays.asList(values); }
  }
  Object getThemedReactContext() { return null; }
  LocationPermissionTest mWebView=this;
  GeolocationPermissions.Callback geolocationPermissionCallback;
  String geolocationPermissionOrigin;
  boolean permissionsRequestShown;
  PermissionRequest permissionRequest;
  List<String> grantedPermissions;
  List<String> pendingPermissions=new ArrayList<>(), requested;
  int calls;
  boolean allowed;
  void requestPermissions(List<String> values) { requested=new ArrayList<>(values); }
  void start(String... granted) {
    ContextCompat.granted=new HashSet<>(Arrays.asList(granted));
    calls=0; requested=null;
    onGeolocationPermissionsShowPrompt("https://winelio.app", (origin, value, retain) -> {
      assert origin.equals("https://winelio.app"); assert !retain; calls++; allowed=value;
    });
  }
  public void onGeolocationPermissionsShowPrompt''' + prompt + '''
  private PermissionListener webviewPermissionsListener''' + listener + '''
  public static void main(String[] args) {
    LocationPermissionTest t=new LocationPermissionTest();
    for(String cached : List.of("coarse", "fine")) {
      t.start(cached); assert t.calls==1 && t.allowed && t.requested==null;
    }
    for(int[] result : new int[][]{{0,0},{-1,0},{0,-1},{-1,-1}}) {
      t.start(); assert t.calls==0 && t.requested.equals(List.of("fine","coarse"));
      assert t.webviewPermissionsListener.onRequestPermissionsResult(3,new String[]{"fine","coarse"},result);
      assert t.calls==1 && t.allowed==(result[0]==0 || result[1]==0);
      assert t.geolocationPermissionCallback==null && t.geolocationPermissionOrigin==null;
    }
    t.start();
    t.webviewPermissionsListener.onRequestPermissionsResult(3,new String[]{"coarse","fine"},new int[]{0,-1});
    assert t.calls==1 && t.allowed;
    t.start();
    t.permissionRequest=new PermissionRequest(); PermissionRequest camera=t.permissionRequest;
    t.grantedPermissions=new ArrayList<>();
    t.webviewPermissionsListener.onRequestPermissionsResult(3,new String[]{"camera"},new int[]{0});
    assert t.calls==0 && camera.received.equals(List.of("camera"));
    t.webviewPermissionsListener.onRequestPermissionsResult(3,new String[]{"fine","coarse"},new int[]{-1,0});
    assert t.calls==1 && t.allowed;
    t.start(); t.pendingPermissions.add("camera");
    assert !t.webviewPermissionsListener.onRequestPermissionsResult(3,new String[]{"fine","coarse"},new int[]{-1,-1});
    assert t.calls==1 && !t.allowed && t.requested.equals(List.of("camera"));
    System.out.println("PASS Android location: cached precise/approximate, fresh request, mixed grants, denial, single callback, camera and queue");
  }
}
'''
java_home = Path(os.environ.get('JAVA_HOME', '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'))
with tempfile.TemporaryDirectory(prefix='winelio-location-test-') as directory:
    path = Path(directory) / 'LocationPermissionTest.java'
    path.write_text(java)
    subprocess.run([str(java_home / 'bin/javac'), str(path)], check=True)
    subprocess.run([str(java_home / 'bin/java'), '-ea', '-cp', directory, 'LocationPermissionTest'], check=True)
