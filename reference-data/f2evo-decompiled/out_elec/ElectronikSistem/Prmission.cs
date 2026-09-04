using System;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Windows.Forms;

namespace ElectronikSistem;

public class Prmission
{
	public static bool IsFileLocked(FileInfo file)
	{
		try
		{
			using FileStream fileStream = file.Open(FileMode.Open, FileAccess.Read, FileShare.None);
			fileStream.Close();
		}
		catch (IOException)
		{
			return true;
		}
		return false;
	}

	public static void AdminRelauncher(string arguments = null)
	{
		ProcessStartInfo processStartInfo = new ProcessStartInfo();
		processStartInfo.UseShellExecute = true;
		processStartInfo.WorkingDirectory = Environment.CurrentDirectory;
		processStartInfo.FileName = Assembly.GetEntryAssembly().CodeBase;
		processStartInfo.Arguments = arguments;
		processStartInfo.Verb = "runas";
		try
		{
			Process.Start(processStartInfo);
			Application.Exit();
		}
		catch (Exception ex)
		{
			MessageBox.Show("This program must be run as an administrator! \n\n" + ex.ToString(), "Error", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
		}
	}

	public static bool IsRunAsAdmin()
	{
		WindowsIdentity current = WindowsIdentity.GetCurrent();
		WindowsPrincipal windowsPrincipal = new WindowsPrincipal(current);
		return windowsPrincipal.IsInRole(WindowsBuiltInRole.Administrator);
	}

	public static bool IsUserAdministrator1()
	{
		try
		{
			WindowsIdentity current = WindowsIdentity.GetCurrent();
			WindowsPrincipal windowsPrincipal = new WindowsPrincipal(current);
			return windowsPrincipal.IsInRole(WindowsBuiltInRole.Administrator);
		}
		catch (UnauthorizedAccessException)
		{
			return false;
		}
		catch (Exception)
		{
			return false;
		}
	}

	public static void ExecuteAsAdmin(string fileName)
	{
		Process process = new Process();
		process.StartInfo.FileName = fileName;
		process.StartInfo.UseShellExecute = true;
		process.StartInfo.Verb = "runas";
		process.Start();
	}

	public static bool SetAcl(string destinationDirectory)
	{
		FileSystemRights fileSystemRights = (FileSystemRights)0;
		fileSystemRights = FileSystemRights.FullControl;
		FileSystemAccessRule rule = new FileSystemAccessRule("Users", fileSystemRights, InheritanceFlags.None, PropagationFlags.NoPropagateInherit, AccessControlType.Allow);
		DirectoryInfo directoryInfo = new DirectoryInfo(destinationDirectory);
		DirectorySecurity accessControl = directoryInfo.GetAccessControl(AccessControlSections.Access);
		bool modified = false;
		accessControl.ModifyAccessRule(AccessControlModification.Set, rule, out modified);
		if (!modified)
		{
			return false;
		}
		InheritanceFlags inheritanceFlags = InheritanceFlags.ObjectInherit;
		inheritanceFlags = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
		rule = new FileSystemAccessRule("Users", fileSystemRights, inheritanceFlags, PropagationFlags.InheritOnly, AccessControlType.Allow);
		modified = false;
		accessControl.ModifyAccessRule(AccessControlModification.Add, rule, out modified);
		if (!modified)
		{
			return false;
		}
		directoryInfo.SetAccessControl(accessControl);
		return true;
	}

	public static void DirectorySetRule(string path)
	{
		DirectorySecurity accessControl = Directory.GetAccessControl(path);
		SecurityIdentifier identity = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
		accessControl.SetAccessRule(new FileSystemAccessRule(identity, FileSystemRights.Modify | FileSystemRights.Synchronize, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
		Directory.SetAccessControl(path, accessControl);
	}

	public static void FileSetRule(string path)
	{
		try
		{
			FileSecurity accessControl = File.GetAccessControl(path);
			SecurityIdentifier identity = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
			accessControl.SetAccessRule(new FileSystemAccessRule(identity, FileSystemRights.FullControl, InheritanceFlags.None, PropagationFlags.None, AccessControlType.Allow));
			File.SetAccessControl(path, accessControl);
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Warning", MessageBoxButtons.OK, MessageBoxIcon.Exclamation, MessageBoxDefaultButton.Button1);
		}
	}

	public static void MakeWritable(string path)
	{
		if (File.Exists(path))
		{
			File.SetAttributes(path, File.GetAttributes(path) & ~FileAttributes.ReadOnly);
		}
	}

	public static void AddSecurity(string fileName)
	{
		AddFileSecurity(fileName, "DomainName\\AccountName", FileSystemRights.FullControl, AccessControlType.Allow);
	}

	public static void AddFileSecurity(string fileName, string account, FileSystemRights rights, AccessControlType controlType)
	{
		FileSecurity accessControl = File.GetAccessControl(fileName);
		accessControl.AddAccessRule(new FileSystemAccessRule(account, rights, controlType));
		File.SetAccessControl(fileName, accessControl);
	}

	public static void RemoveFileSecurity(string fileName, string account, FileSystemRights rights, AccessControlType controlType)
	{
		FileSecurity accessControl = File.GetAccessControl(fileName);
		accessControl.RemoveAccessRule(new FileSystemAccessRule(account, rights, controlType));
		File.SetAccessControl(fileName, accessControl);
	}

	private static void makeShare(string servername, string filepath, string sharename)
	{
		try
		{
			string path = $"\\\\{servername}\\root\\cimv2";
			ManagementScope scope = new ManagementScope(path);
			ManagementClass managementClass = new ManagementClass("Win32_Share");
			managementClass.Scope = scope;
			object[] args = new object[3] { filepath, sharename, "0" };
			object obj = managementClass.InvokeMethod("Create", args);
		}
		catch (SystemException ex)
		{
			Console.WriteLine("Error attempting to create share {0}:", sharename);
			Console.WriteLine(ex.Message);
		}
	}

	public static void ShareFolderPermission(string FolderPath, string ShareName, string Description)
	{
		try
		{
			ManagementClass managementClass = new ManagementClass("Win32_Share");
			ManagementBaseObject methodParameters = managementClass.GetMethodParameters("Create");
			methodParameters["Description"] = Description;
			methodParameters["Name"] = ShareName;
			methodParameters["Path"] = FolderPath;
			methodParameters["Type"] = 0;
			methodParameters["MaximumAllowed"] = null;
			methodParameters["Password"] = null;
			methodParameters["Access"] = null;
			ManagementBaseObject managementBaseObject = managementClass.InvokeMethod("Create", methodParameters, null);
			if ((uint)managementBaseObject.Properties["ReturnValue"].Value != 0)
			{
			}
			NTAccount nTAccount = new NTAccount("Everyone");
			SecurityIdentifier securityIdentifier = (SecurityIdentifier)nTAccount.Translate(typeof(SecurityIdentifier));
			byte[] array = new byte[securityIdentifier.BinaryLength];
			securityIdentifier.GetBinaryForm(array, 0);
			ManagementObject managementObject = new ManagementClass(new ManagementPath("Win32_Trustee"), null);
			managementObject["Name"] = "Everyone";
			managementObject["SID"] = array;
			ManagementObject managementObject2 = new ManagementClass(new ManagementPath("Win32_Ace"), null);
			managementObject2["AccessMask"] = 2032127;
			managementObject2["AceFlags"] = AceFlags.ObjectInherit | AceFlags.ContainerInherit;
			managementObject2["AceType"] = AceType.AccessAllowed;
			managementObject2["Trustee"] = managementObject;
			ManagementObject managementObject3 = new ManagementClass(new ManagementPath("Win32_SecurityDescriptor"), null);
			managementObject3["ControlFlags"] = 4;
			managementObject3["DACL"] = new object[1] { managementObject2 };
			ManagementObject managementObject4 = new ManagementObject(managementClass.Path?.ToString() + ".Name='" + ShareName + "'");
			managementObject4.InvokeMethod("SetShareInfo", new object[3]
			{
				int.MaxValue,
				Description,
				managementObject3
			});
		}
		catch (Exception)
		{
		}
	}
}
