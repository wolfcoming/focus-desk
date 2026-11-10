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
        val nodeHome = resolveNodeHome()
        val nodeExe = File(nodeHome, if (Os.isFamily(Os.FAMILY_WINDOWS)) "node.exe" else "node")
        val npmCli = File(nodeHome, "node_modules/npm/bin/npm-cli.js")
        if (!nodeExe.isFile) {
            throw GradleException("Node.js executable not found at ${nodeExe.absolutePath}")
        }
        if (!npmCli.isFile) {
            throw GradleException("npm-cli.js not found at ${npmCli.absolutePath}")
        }

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

        val pathExtras = mutableListOf(nodeHome.absolutePath)
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

    private fun resolveNodeHome(): File {
        val candidates = linkedSetOf<File>()
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

        val path = System.getenv("PATH") ?: ""
        val sep = if (Os.isFamily(Os.FAMILY_WINDOWS)) ';' else ':'
        for (dir in path.split(sep).map { it.trim() }.filter { it.isNotEmpty() }) {
            candidates += File(dir)
        }

        return candidates.firstOrNull { home ->
            val node = File(home, if (Os.isFamily(Os.FAMILY_WINDOWS)) "node.exe" else "node")
            val npmCli = File(home, "node_modules/npm/bin/npm-cli.js")
            node.isFile && npmCli.isFile
        } ?: throw GradleException(
            "Could not find a Node.js install with npm. Checked: " +
                candidates.joinToString { it.absolutePath },
        )
    }
}
