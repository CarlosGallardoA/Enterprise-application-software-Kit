using Acme.Domain.Incidents;

namespace Acme.Application.Incidents;

public interface ICreateIncident
{
    const string Note = "Acme.Infrastructure.Persistence.NotAReference"; // Acme.Infrastructure.Persistence.AlsoNot

    System.Threading.Tasks.Task<Incident> ExecuteAsync();
}
