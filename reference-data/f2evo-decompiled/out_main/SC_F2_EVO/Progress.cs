using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class Progress : Form
{
	private IContainer components = null;

	public ProgressBar Status;

	public Progress()
	{
		InitializeComponent();
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing && components != null)
		{
			components.Dispose();
		}
		base.Dispose(disposing);
	}

	private void InitializeComponent()
	{
		this.Status = new System.Windows.Forms.ProgressBar();
		base.SuspendLayout();
		this.Status.Location = new System.Drawing.Point(12, 13);
		this.Status.Name = "Status";
		this.Status.Size = new System.Drawing.Size(478, 23);
		this.Status.TabIndex = 0;
		base.AutoScaleDimensions = new System.Drawing.SizeF(6f, 13f);
		base.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
		base.ClientSize = new System.Drawing.Size(502, 49);
		base.Controls.Add(this.Status);
		base.FormBorderStyle = System.Windows.Forms.FormBorderStyle.Fixed3D;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		base.Name = "Progress";
		base.ShowInTaskbar = false;
		base.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
		this.Text = "Progress";
		base.ResumeLayout(false);
	}
}
