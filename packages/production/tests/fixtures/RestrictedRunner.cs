using System;
using System.ComponentModel;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;

internal static class RestrictedRunner
{
    private const UInt32 SaferScopeUser = 2;
    private const UInt32 SaferLevelConstrained = 0x10000;

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SaferCreateLevel(
        UInt32 ScopeId,
        UInt32 LevelId,
        UInt32 OpenFlags,
        out IntPtr LevelHandle,
        IntPtr Reserved);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SaferComputeTokenFromLevel(
        IntPtr LevelHandle,
        IntPtr InAccessToken,
        out IntPtr OutAccessToken,
        UInt32 Flags,
        IntPtr Reserved);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool SaferCloseLevel(IntPtr LevelHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr Handle);

    private static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--probe-denied") {
            return UnderRestrictedToken(delegate { return ProbeDenied(args[1]); });
        }
        if (args.Length == 2 && args[0] == "--probe-readwrite") {
            return UnderRestrictedToken(delegate { return ProbeReadWrite(args[1]); });
        }
        if (args.Length == 1 && args[0] == "--identity") {
            return UnderRestrictedToken(delegate {
                WindowsIdentity identity = WindowsIdentity.GetCurrent();
                Console.Out.Write(identity.Name + "|" + identity.ImpersonationLevel + "\n");
                return 0;
            });
        }
        if (args.Length < 3 || args[0] != "--launch")
        {
            Console.Error.Write("restricted-runner: invalid invocation.\n");
            return 2;
        }

        string workingDirectory = Path.GetFullPath(args[1]);
        string application = Path.GetFullPath(args[2]);
        string[] childArgs = new string[args.Length - 3];
        Array.Copy(args, 3, childArgs, 0, childArgs.Length);

        try
        {
            Assembly launcher = Assembly.Load(File.ReadAllBytes(application));
            MethodInfo entryPoint = launcher.EntryPoint;
            if (entryPoint == null) throw new InvalidOperationException("Launcher entry point is absent.");
            Environment.CurrentDirectory = workingDirectory;
            return UnderRestrictedToken(delegate {
                try
                {
                    object result = entryPoint.Invoke(null, new object[] { childArgs });
                    return result == null ? 0 : Convert.ToInt32(result);
                }
                catch (TargetInvocationException error)
                {
                    throw error.InnerException ?? error;
                }
            });
        }
        catch (Exception error)
        {
            Console.Error.Write("restricted-runner: " + error.Message + "\n");
            return 1;
        }
    }

    private static int UnderRestrictedToken(Func<int> action)
    {
        IntPtr saferLevel = IntPtr.Zero;
        IntPtr restrictedToken = IntPtr.Zero;
        try
        {
            if (!SaferCreateLevel(
                SaferScopeUser,
                SaferLevelConstrained,
                0,
                out saferLevel,
                IntPtr.Zero)) ThrowLastError("SaferCreateLevel");
            if (!SaferComputeTokenFromLevel(
                saferLevel,
                IntPtr.Zero,
                out restrictedToken,
                0,
                IntPtr.Zero)) ThrowLastError("SaferComputeTokenFromLevel");
            using (WindowsImpersonationContext context = WindowsIdentity.Impersonate(restrictedToken)) {
                return action();
            }
        }
        catch (Exception error)
        {
            Console.Error.Write("restricted-runner: " + error.Message + "\n");
            return 1;
        }
        finally
        {
            if (restrictedToken != IntPtr.Zero) CloseHandle(restrictedToken);
            if (saferLevel != IntPtr.Zero) SaferCloseLevel(saferLevel);
        }
    }

    private static int ProbeDenied(string path)
    {
        try
        {
            using (FileStream stream = File.OpenRead(Path.GetFullPath(path))) {
                stream.ReadByte();
            }
            Console.Error.Write("restricted-runner: protected path was readable.\n");
            return 1;
        }
        catch (UnauthorizedAccessException)
        {
            Console.Out.Write("denied\n");
            return 0;
        }
    }

    private static int ProbeReadWrite(string directory)
    {
        string path = Path.Combine(Path.GetFullPath(directory), "restricted-access-probe.txt");
        try
        {
            File.WriteAllText(path, "restricted");
            if (File.ReadAllText(path) != "restricted") return 1;
            File.Delete(path);
            Console.Out.Write("readwrite\n");
            return 0;
        }
        catch
        {
            try { File.Delete(path); } catch { }
            Console.Error.Write("restricted-runner: work root was not read-write.\n");
            return 1;
        }
    }

    private static void ThrowLastError(string operation)
    {
        int code = Marshal.GetLastWin32Error();
        throw new Win32Exception(code, operation + " failed with Win32 error " + code + ".");
    }
}
