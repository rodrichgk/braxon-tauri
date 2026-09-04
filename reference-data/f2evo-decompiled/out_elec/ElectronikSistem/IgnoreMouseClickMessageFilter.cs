using System;
using System.Windows.Forms;

namespace ElectronikSistem;

public class IgnoreMouseClickMessageFilter : IMessageFilter
{
	public EventHandler DoubleClickEvent;

	private Control _Parent { get; set; }

	private Control _Target { get; set; }

	public IgnoreMouseClickMessageFilter(Control parent, Control target)
	{
		_Parent = parent;
		_Target = target;
	}

	public bool PreFilterMessage(ref Message m)
	{
		if (_Parent == null)
		{
			return false;
		}
		Control control = (control = _Parent.GetChildAtPoint(_Parent.PointToClient(Cursor.Position)));
		if (control == null)
		{
			return false;
		}
		if (control != _Target)
		{
			return false;
		}
		if ((m.Msg == 514 || m.Msg == 516 || m.Msg == 517 || m.Msg == 515) && m.Msg == 515)
		{
			control.Invoke(new EventHandler(DoubleClickEvent.Invoke));
			return true;
		}
		return false;
	}
}
