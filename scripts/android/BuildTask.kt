import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import javax.inject.Inject
import org.gradle.process.ExecOperations

abstract class BuildTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @Input
    var rootDirRel: String? = null
    @Input
    var projectDir: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val workingDir = File(projectDir, rootDirRel)
        val (nodeExe, npmCli) = resolveNodeInstall()

        val args = mutableListOf(
            npmCli.absolutePath,
            "run",
            "--",
            "tauri",
            "android",
            "android-studio-script",
        )
        if (logger.isEnabled(LogLevel.DEBUG)) {
            args += "-vv"
        } else if (logger.isEnabled(LogLevel.INFO)) {
            args += "-v"
        }
        if (release) {
            args += "--release"
        }
        args += listOf("--target", target)

        val pathExtras = mutableListOf(nodeExe.parentFile.absolutePath)
        System.getenv("HOME")?.let { home ->
            pathExtras += File(home, ".cargo/bin").absolutePath
        }
        System.getenv("USERPROFILE")?.let { home ->
            pathExtras += File(home, ".cargo/bin").absolutePath
            pathExtras += File(home, "scoop/shims").absolutePath
            pathExtras += File(home, "scoop/apps/rustup/current/.cargo/bin").absolutePath
        }

        execOperations.exec {
            workingDir(workingDir)
            executable(nodeExe.absolutePath)
            args(args)
            environment(
                "PATH",
                (pathExtras + listOfNotNull(System.getenv("PATH")))
                    .joinToString(File.pathSeparator),
            )
        }.assertNormalExitValue()
    }

    private data class NodeInstall(val nodeExe: File, val npmCli: File)

    private fun resolveNodeInstall(): NodeInstall {
        val candidates = linkedSetOf<File>()
        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            val programFiles = System.getenv("ProgramFiles") ?: "C:\\Program Files"
            val localAppData = System.getenv("LOCALAPPDATA")
            val userProfile = System.getenv("USERPROFILE")
            candidates += File(programFiles, "nodejs")
            if (localAppData != null) {
                candidates += File(localAppData, "Programs/nodejs")
            }
            if (userProfile != null) {
                candidates += File(userProfile, "scoop/apps/nodejs/current")
            }
        } else {
            listOf(
                "/usr/local/bin",
                "/opt/homebrew/bin",
                "/usr/bin",
            ).forEach { candidates += File(it) }
            System.getenv("HOME")?.let { home ->
                candidates += File(home, ".nvm")
                File(home, ".nvm/versions/node").takeIf { it.isDirectory }?.listFiles()
                    ?.filter { it.isDirectory }
                    ?.sortedByDescending { it.name }
                    ?.forEach { candidates += File(it, "bin") }
            }
        }

        val path = System.getenv("PATH") ?: ""
        val sep = if (Os.isFamily(Os.FAMILY_WINDOWS)) ';' else ':'
        for (dir in path.split(sep).map { it.trim() }.filter { it.isNotEmpty() }) {
            candidates += File(dir)
        }

        val checked = mutableListOf<String>()
        for (home in candidates) {
            val nodeName = if (Os.isFamily(Os.FAMILY_WINDOWS)) "node.exe" else "node"
            val nodeExe = File(home, nodeName)
            checked += nodeExe.absolutePath
            if (!nodeExe.isFile) continue

            val npmCandidates = listOf(
                File(home, "node_modules/npm/bin/npm-cli.js"),
                File(home.parentFile, "lib/node_modules/npm/bin/npm-cli.js"),
                File(home, "../lib/node_modules/npm/bin/npm-cli.js"),
            )
            val npmCli = npmCandidates.firstOrNull { it.isFile }
            if (npmCli != null) {
                return NodeInstall(nodeExe, npmCli)
            }
            checked += npmCandidates.joinToString { it.absolutePath }
        }

        throw GradleException(
            "Could not find a Node.js install with npm. Checked: " +
                checked.joinToString(),
        )
    }
}
