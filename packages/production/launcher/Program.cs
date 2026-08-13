using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;

internal static class VoxLauncher
{
    private const int ProtocolVersion = 1;
    private const int MaximumFrameBytes = 16 * 1024 * 1024;

    private static int Main(string[] args)
    {
        try
        {
            string pipeName = Environment.GetEnvironmentVariable("VOX_PIPE_NAME");
            string secret = Environment.GetEnvironmentVariable("VOX_IPC_TOKEN");
            if (String.IsNullOrEmpty(pipeName) || String.IsNullOrEmpty(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
            {
                Console.Error.Write("vox: IPC configuration is unavailable.\n");
                return 2;
            }
            if (!IsPipeName(pipeName))
            {
                Console.Error.Write("vox: IPC pipe name is invalid.\n");
                return 2;
            }

            string requestId = Guid.NewGuid().ToString("D");
            long timestampMs = (DateTime.UtcNow.Ticks - 621355968000000000L) / TimeSpan.TicksPerMillisecond;
            string cwd = Environment.CurrentDirectory;
            var unsigned = new Dictionary<string, object>();
            unsigned["protocolVersion"] = ProtocolVersion;
            unsigned["requestId"] = requestId;
            unsigned["timestampMs"] = timestampMs;
            unsigned["cwd"] = cwd;
            unsigned["argv"] = args;
            var request = new Dictionary<string, object>(unsigned);
            request["mac"] = Sign(secret, RequestSigningText(requestId, timestampMs, cwd, args));

            var serializer = new JavaScriptSerializer();
            serializer.MaxJsonLength = MaximumFrameBytes;
            byte[] requestBytes = Encoding.UTF8.GetBytes(serializer.Serialize(request));

            using (var pipe = new NamedPipeClientStream(
                ".",
                pipeName,
                PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize,
                PipeOptions.None,
                TokenImpersonationLevel.Anonymous,
                HandleInheritability.None))
            {
                pipe.Connect(30000);
                WriteFrame(pipe, requestBytes);
                byte[] responseBytes = ReadFrame(pipe);
                var response = serializer.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(responseBytes));
                int version = Convert.ToInt32(response["protocolVersion"]);
                string responseId = Convert.ToString(response["requestId"]);
                int exitCode = Convert.ToInt32(response["exitCode"]);
                string stdoutBase64 = Convert.ToString(response["stdoutBase64"]);
                string stderrBase64 = Convert.ToString(response["stderrBase64"]);
                string mac = Convert.ToString(response["mac"]);
                if (version != ProtocolVersion || responseId != requestId || exitCode < 0 || exitCode > 2 ||
                    !FixedEquals(mac, Sign(secret, ResponseSigningText(responseId, exitCode, stdoutBase64, stderrBase64))))
                {
                    Console.Error.Write("vox: IPC response authentication failed.\n");
                    return 1;
                }
                byte[] stdout = Convert.FromBase64String(stdoutBase64);
                byte[] stderr = Convert.FromBase64String(stderrBase64);
                Stream standardOutput = Console.OpenStandardOutput();
                Stream standardError = Console.OpenStandardError();
                standardOutput.Write(stdout, 0, stdout.Length);
                standardError.Write(stderr, 0, stderr.Length);
                return exitCode;
            }
        }
        catch
        {
            Console.Error.Write("vox: Production service is unavailable.\n");
            return 1;
        }
    }

    private static bool IsPipeName(string value)
    {
        if (value.Length < 1 || value.Length > 180) return false;
        foreach (char c in value)
        {
            if (!(Char.IsLetterOrDigit(c) || c == '.' || c == '_' || c == '-')) return false;
        }
        return true;
    }

    private static string Field(string value)
    {
        return Encoding.UTF8.GetByteCount(value).ToString() + ":" + value;
    }

    private static string RequestSigningText(string requestId, long timestampMs, string cwd, string[] args)
    {
        var fields = new List<string>();
        fields.Add("VOX-IPC-REQUEST-1");
        fields.Add(Field(requestId));
        fields.Add(Field(timestampMs.ToString()));
        fields.Add(Field(cwd));
        fields.Add(Field(args.Length.ToString()));
        foreach (string arg in args) fields.Add(Field(arg));
        return String.Join("\n", fields.ToArray());
    }

    private static string ResponseSigningText(string requestId, int exitCode, string stdoutBase64, string stderrBase64)
    {
        return String.Join("\n", new string[] {
            "VOX-IPC-RESPONSE-1", Field(requestId), Field(exitCode.ToString()), Field(stdoutBase64), Field(stderrBase64)
        });
    }

    private static string Sign(string secret, string value)
    {
        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
        {
            byte[] digest = hmac.ComputeHash(Encoding.UTF8.GetBytes(value));
            var result = new StringBuilder(digest.Length * 2);
            foreach (byte item in digest) result.Append(item.ToString("x2"));
            return result.ToString();
        }
    }

    private static bool FixedEquals(string left, string right)
    {
        if (left == null || right == null || left.Length != right.Length) return false;
        int difference = 0;
        for (int index = 0; index < left.Length; index++) difference |= left[index] ^ right[index];
        return difference == 0;
    }

    private static void WriteFrame(Stream stream, byte[] body)
    {
        if (body.Length < 1 || body.Length > MaximumFrameBytes) throw new InvalidDataException();
        byte[] header = BitConverter.GetBytes(body.Length);
        stream.Write(header, 0, header.Length);
        stream.Write(body, 0, body.Length);
        stream.Flush();
    }

    private static byte[] ReadFrame(Stream stream)
    {
        byte[] header = ReadExact(stream, 4);
        int length = BitConverter.ToInt32(header, 0);
        if (length < 1 || length > MaximumFrameBytes) throw new InvalidDataException();
        return ReadExact(stream, length);
    }

    private static byte[] ReadExact(Stream stream, int length)
    {
        byte[] bytes = new byte[length];
        int offset = 0;
        while (offset < length)
        {
            int count = stream.Read(bytes, offset, length - offset);
            if (count == 0) throw new EndOfStreamException();
            offset += count;
        }
        return bytes;
    }
}
