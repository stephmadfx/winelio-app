package app.winelio.referral

import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import java.io.File
import org.json.JSONObject

class WinelioReferralModule : Module() {
  // Les marqueurs d'une ancienne installation ne doivent pas être restaurés par Android Backup.
  private fun stateFile(): AtomicFile {
    val context = appContext.reactContext ?: throw IllegalStateException("Application indisponible")
    return AtomicFile(File(context.noBackupFilesDir, "winelio-referral.json"))
  }

  private fun readState(file: AtomicFile): JSONObject =
    if (!file.baseFile.exists()) JSONObject()
    else JSONObject(file.openRead().bufferedReader().use { it.readText() })

  override fun definition() = ModuleDefinition {
    Name("WinelioReferral")

    Function("getItem") { key: String ->
      val state = readState(stateFile())
      if (state.has(key)) state.getString(key) else null
    }
    Function("setItem") { key: String, value: String? ->
      val file = stateFile()
      val state = readState(file)
      if (value == null) state.remove(key) else state.put(key, value)
      val stream = file.startWrite()
      try {
        stream.write(state.toString().toByteArray(Charsets.UTF_8))
        file.finishWrite(stream)
      } catch (error: Exception) {
        file.failWrite(stream)
        throw error
      }
    }

    AsyncFunction("getInstallReferrer") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("REFERRER_CONTEXT", "Application indisponible", null)
        return@AsyncFunction
      }
      val client = InstallReferrerClient.newBuilder(context).build()
      val finished = AtomicBoolean(false)
      val handler = Handler(Looper.getMainLooper())
      fun finish(value: String?, error: String?) {
        if (!finished.compareAndSet(false, true)) return
        handler.removeCallbacksAndMessages(null)
        try { client.endConnection() } catch (_: Exception) { }
        if (error == null) promise.resolve(value)
        else promise.reject("REFERRER_RETRY", error, null)
      }
      handler.postDelayed({ finish(null, "Google Play ne répond pas") }, 5000)
      try {
        client.startConnection(object : InstallReferrerStateListener {
          override fun onInstallReferrerSetupFinished(responseCode: Int) {
            if (finished.get()) return
            when (responseCode) {
              InstallReferrerClient.InstallReferrerResponse.OK -> {
                try { finish(client.installReferrer.installReferrer, null) }
                catch (_: Exception) { finish(null, "Référence temporairement indisponible") }
              }
              InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED -> finish(null, null)
              else -> finish(null, "Connexion Google Play indisponible")
            }
          }
          override fun onInstallReferrerServiceDisconnected() {
            finish(null, "Connexion Google Play interrompue")
          }
        })
      } catch (_: Exception) {
        finish(null, "Connexion Google Play impossible")
      }
    }
  }
}
