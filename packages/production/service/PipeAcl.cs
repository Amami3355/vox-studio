using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

internal static class VoxPipeAcl
{
    private static int Main(string[] args)
    {
        if (args.Length != 1 || !IsPipeName(args[0]))
        {
            Console.Error.Write("vox-pipe-acl: invalid invocation.\n");
            return 2;
        }

        try
        {
            using (var pipe = new NamedPipeClientStream(
                ".",
                args[0],
                PipeAccessRights.ReadWrite | PipeAccessRights.ChangePermissions,
                PipeOptions.None,
                TokenImpersonationLevel.Anonymous,
                HandleInheritability.None))
            {
                pipe.Connect(30000);
                PipeSecurity security = pipe.GetAccessControl();
                GrantReadWrite(security, "S-1-5-12");
                GrantReadWrite(security, "S-1-5-32-545");
                pipe.SetAccessControl(security);
            }
            return 0;
        }
        catch
        {
            Console.Error.Write("vox-pipe-acl: pipe authorization failed.\n");
            return 1;
        }
    }

    private static void GrantReadWrite(PipeSecurity security, string sid)
    {
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(sid),
            PipeAccessRights.ReadWrite,
            AccessControlType.Allow));
    }

    private static bool IsPipeName(string value)
    {
        if (value.Length < 1 || value.Length > 180) return false;
        foreach (char item in value)
        {
            if (!(Char.IsLetterOrDigit(item) || item == '.' || item == '_' || item == '-')) {
                return false;
            }
        }
        return true;
    }
}
