namespace Acme.Domain.Incidents;

public sealed class Incident
{
    public System.Threading.Tasks.Task Pending { get; } = System.Threading.Tasks.Task.CompletedTask;
}
