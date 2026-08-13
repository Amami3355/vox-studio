using System;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

internal static class VoxPipeBridge
{
    private const int BufferSize = 64 * 1024;
    private const int MaximumFrameBytes = 16 * 1024 * 1024;

    private static int Main(string[] args)
    {
        if (args.Length != 2 || !IsPipeName(args[0]) || !IsPipeName(args[1]) || args[0] == args[1])
        {
            Console.Error.Write("vox-pipe-bridge: invalid invocation.\n");
            return 2;
        }

        try
        {
            bool announced = false;
            while (true)
            {
                using (NamedPipeServerStream publicPipe = CreatePublicPipe(args[0]))
                {
                    if (!announced)
                    {
                        Console.Out.Write("VOX_PIPE_BRIDGE_READY\n");
                        Console.Out.Flush();
                        announced = true;
                    }
                    publicPipe.WaitForConnection();
                    try
                    {
                        using (var privatePipe = new NamedPipeClientStream(
                            ".",
                            args[1],
                            PipeDirection.InOut,
                            PipeOptions.None,
                            TokenImpersonationLevel.Anonymous))
                        {
                            privatePipe.Connect(30000);
                            Relay(publicPipe, privatePipe);
                        }
                    }
                    catch (IOException)
                    {
                    }
                    catch (UnauthorizedAccessException)
                    {
                    }
                    catch (TimeoutException)
                    {
                    }
                }
            }
        }
        catch
        {
            Console.Error.Write("vox-pipe-bridge: bridge failed.\n");
            return 1;
        }
    }

    private static NamedPipeServerStream CreatePublicPipe(string name)
    {
        var security = new PipeSecurity();
        SecurityIdentifier owner = WindowsIdentity.GetCurrent().User;
        security.SetOwner(owner);
        security.AddAccessRule(new PipeAccessRule(
            owner,
            PipeAccessRights.ReadWrite,
            AccessControlType.Allow));
        GrantReadWrite(security, "S-1-5-12");
        GrantReadWrite(security, "S-1-5-32-545");
        GrantLocalAccountReadWrite(security, "CodexSandboxOffline");
        GrantLocalAccountReadWrite(security, "CodexSandboxOnline");
        return new NamedPipeServerStream(
            name,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            BufferSize,
            BufferSize,
            security);
    }

    private static void GrantReadWrite(PipeSecurity security, string sid)
    {
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(sid),
            PipeAccessRights.FullControl,
            AccessControlType.Allow));
    }

    private static void GrantLocalAccountReadWrite(PipeSecurity security, string accountName)
    {
        try
        {
            var account = new NTAccount(Environment.MachineName, accountName);
            var sid = (SecurityIdentifier)account.Translate(typeof(SecurityIdentifier));
            GrantReadWrite(security, sid.Value);
        }
        catch (IdentityNotMappedException)
        {
        }
    }

    private static void Relay(Stream publicPipe, Stream privatePipe)
    {
        ForwardFrame(publicPipe, privatePipe);
        ForwardFrame(privatePipe, publicPipe);
    }

    private static void ForwardFrame(Stream source, Stream destination)
    {
        byte[] header = ReadExactly(source, 4);
        int length = BitConverter.ToInt32(header, 0);
        if (length < 1 || length > MaximumFrameBytes)
        {
            throw new InvalidDataException("Vox IPC frame length is invalid.");
        }
        destination.Write(header, 0, header.Length);
        byte[] buffer = new byte[BufferSize];
        int remaining = length;
        while (remaining > 0)
        {
            int read = source.Read(buffer, 0, Math.Min(buffer.Length, remaining));
            if (read < 1) throw new EndOfStreamException("Vox IPC frame is incomplete.");
            destination.Write(buffer, 0, read);
            remaining -= read;
        }
        destination.Flush();
    }

    private static byte[] ReadExactly(Stream source, int length)
    {
        byte[] value = new byte[length];
        int offset = 0;
        while (offset < length)
        {
            int read = source.Read(value, offset, length - offset);
            if (read < 1) throw new EndOfStreamException("Vox IPC frame is incomplete.");
            offset += read;
        }
        return value;
    }

    private static bool IsPipeName(string value)
    {
        if (value.Length < 1 || value.Length > 180) return false;
        foreach (char item in value)
        {
            if (!(Char.IsLetterOrDigit(item) || item == '.' || item == '_' || item == '-'))
            {
                return false;
            }
        }
        return true;
    }
}
